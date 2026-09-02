import type { NodeCapabilities } from "@automationstack/farm-node-protocol/capabilities";

/**
 * 「这个源能不能兑现这次请求」的判据，以及把能力清单说成人话的那几句。
 *
 * ## 两种后端，两个真相源
 *
 * - **local 后端**（含 `FARM_PROVIDER=local` 的内建伪节点）：真相是那台机器上
 *   **真的装了什么**，也就是它自己探出来、报上来的 `capabilities.browsers`。
 *   farm 这边没有别的办法知道一台北京的台式机上有没有 Chrome 141。
 * - **docker 后端**：真相是 **farm 库里的镜像目录**（`farm_browsers`）。
 *   为什么不是节点上「已经拉下来的镜像」——那份清单是一张快照，管理员今天在目录里
 *   加了一行、节点明天才会 `docker pull`，若按快照筛选，这台机器会被**永久**排除在
 *   这个浏览器之外，直到有人想起来去手点一次重探。而按目录筛选，最坏情况是节点
 *   拉一次镜像（慢，但会成功）。慢一次 vs 永远选不上，取前者。
 *
 * 于是这里的 `sourceSatisfies` 对 docker 源恒为真：能走到 `acquire`，就说明
 * `launch-session-shell.ts` 的 `pickBrowser` 已经在目录里找到了那一行——目录的
 * 筛选在更上游就做完了，这里再查一遍只会是同一份数据的第二次拷贝。
 *
 * ## 筛选必须与兑现同口径，否则闸门会把干得成的活拒掉
 *
 * 兑现那一侧是 `browser-slots` 的 `local-browser-pick.ts`，它的规则是：
 * **chromium 系（chrome / chromium / edge / msedge）互认**，清单里没查到就回落到
 * 配置的那个 chrome bin；只有非 chromium 系才当场报错（chromedriver 的边界）。
 * 于是筛选这边也必须认这个家族——不然默认目录行（`chromium / latest`）配上一台
 * 只报了 `chrome` 的 macOS 机器，会被闸门判成「没有源能提供 chromium」，
 * 而那台机器其实一秒就能把它跑起来。
 *
 * 版本上则相反，这边**严**：兑现那侧版本对不上会安静回落到配置的 bin，
 * 跑出来的是另一个版本而没人知道；筛选这边把「点名要 141、全场只有 140」
 * 挡在门口，报一句人话。这是两侧刻意的不对称，不是漏对齐。
 *
 * 规则在这里重写了一遍而不是复用，是因为那两个函数都没导出，而共享包这一轮不动。
 * 真要合并，也该是先把家族/版本两条规则各自的严格度写清楚了再合。
 */

/** 与 `local-browser-pick.ts` 的 `CHROMIUM_FAMILY` 逐字同一份名单。 */
const CHROMIUM_FAMILY = new Set(["chrome", "chromium", "edge", "msedge"]);

/**
 * 「哪个版本都行」的 tag。目录行的默认版本就是 `latest`
 * （`reaper.ts` 的 `SEED_VERSION`），它一路下发到这里，当成一个字面版本号去前缀
 * 匹配的话，任何真实版本都匹配不上——默认路径会被自己的默认值拦死。
 */
const ANY_VERSION_TAGS = new Set(["", "any", "latest"]);

/** 一次请求要的浏览器。`browserVersion` 为 null = 哪个版本都行。 */
export interface BrowserRequirement {
	browserName: string;
	browserVersion: string | null;
}

/** 给 `/health` 和报错文案看的能力摘要。`versions` 为空 = 有这个浏览器但报不出版本。 */
export interface BrowserSummary {
	name: string;
	versions: string[];
}

/**
 * 版本前缀匹配：要 `141` 给 `141.0.7390.65` 算命中，要 `141` 给 `1410` 不算。
 * 边界靠那个点，不能只用 `startsWith`。
 */
function versionMatches(actual: string, wanted: string): boolean {
	return actual === wanted || actual.startsWith(`${wanted}.`);
}

/** 家族归一：chromium 系一律折成 `chromium`，其余按小写原名。 */
function familyOf(name: string): string {
	const lower = name.trim().toLowerCase();
	return CHROMIUM_FAMILY.has(lower) ? "chromium" : lower;
}

function sameBrowserName(a: string, b: string): boolean {
	return familyOf(a) === familyOf(b);
}

/**
 * 能力清单 → 摘要。**只收 `available: true` 的**：一条 `available: false` 的记录
 * （比如 macOS 上那条恒为不可用的 Safari）是「我知道它存在但用不了」，把它摆进
 * 摘要里，只会让人以为点名 safari 会成功。
 */
export function summarizeBrowsers(
	capabilities: NodeCapabilities
): BrowserSummary[] {
	const byName = new Map<string, string[]>();
	for (const browser of capabilities.browsers) {
		if (!browser.available) {
			continue;
		}
		const key = browser.name.toLowerCase();
		const versions = byName.get(key) ?? [];
		if (browser.version !== null && !versions.includes(browser.version)) {
			versions.push(browser.version);
		}
		byName.set(key, versions);
	}
	return [...byName].map(([name, versions]) => ({ name, versions }));
}

/**
 * 摘要能不能满足这次请求。
 *
 * null 摘要（源还没报过能力）一律不满足：那是「还不知道」，不是「探出来是空的」。
 * 宁可报一句「没有源能提供 chrome」，也不要把会话送进一台可能一个浏览器都没有的机器，
 * 让它在 60 秒的 acquire 超时之后才失败。
 */
export function summarySatisfies(
	summaries: BrowserSummary[] | null,
	requirement: BrowserRequirement
): boolean {
	if (summaries === null) {
		return false;
	}
	const matched = summaries.filter((summary) =>
		sameBrowserName(summary.name, requirement.browserName)
	);
	if (matched.length === 0) {
		return false;
	}
	const wanted = requirement.browserVersion;
	if (wanted === null || ANY_VERSION_TAGS.has(wanted.toLowerCase())) {
		return true;
	}
	// 同一家族里任意一条命中即可：兑现那侧也是在整份清单里回查的。
	return matched.some((summary) =>
		summary.versions.some((version) => versionMatches(version, wanted))
	);
}

/** 一句话说清一个源能提供什么，用在筛不出源时的那段清单里。 */
export function describeSummary(summaries: BrowserSummary[] | null): string {
	if (summaries === null) {
		return "还没报过能力";
	}
	if (summaries.length === 0) {
		return "没有可用的浏览器";
	}
	return summaries
		.map((summary) =>
			summary.versions.length === 0
				? `${summary.name}（版本未知）`
				: `${summary.name} ${summary.versions.join(" / ")}`
		)
		.join("，");
}

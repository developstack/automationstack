import type { BrowserCapability } from "@automationstack/farm-node-protocol/capabilities";

/**
 * 「farm 点名要 `<name> <version>`，本机该用哪个二进制」。
 *
 * 调度已经按能力清单筛过一轮了（`rpc.ts` 的 `acquireParams` 那段），这里做的是
 * **把那个选择兑现**：在同一份清单里按名字与版本回查出 `bin`。它不再猜、
 * 也不再自己去探测——探测的结果由调用方（node-agent 启动时探一次）注入进来。
 *
 * 单拎成一个文件是被 300 行上限逼的（`local.ts` 正好在线上），但切口是干净的：
 * 这里一行 IO 都没有，纯粹是清单上的一次查找。
 */

/**
 * chromedriver 只能驱动 **chromium 系**。
 *
 * 这不是我们的取舍，是 chromedriver 自己的边界：它是 Chromium 项目的
 * WebDriver 实现，`goog:chromeOptions` 那套东西对 Firefox / Safari 毫无意义。
 * 所以点名要一个非 chromium 系浏览器时，正确的行为是**当场报一句人话**，
 * 而不是安静地拉起 Chrome——后者会让一条声称在测 Firefox 的用例全绿。
 */
const CHROMIUM_FAMILY = new Set(["chrome", "chromium", "edge", "msedge"]);

export interface PickBrowserBinInput {
	/** farm 下发的浏览器名。undefined = 没点名（老调用方 / 内建源）。 */
	browserName?: string | undefined;
	/** 本机探测出来的能力清单，通常是 agent 启动时探的那一份。 */
	browsers?: readonly BrowserCapability[] | undefined;
	/** farm 下发的版本，null/undefined = 哪个版本都行。 */
	browserVersion?: string | null | undefined;
	/** 清单里选不出来时的回落：`resolveChromeBinary(...)` 那条老路。 */
	fallback: () => string;
}

/** 版本前缀匹配：farm 常常只下发主版本（`140`），而本机报的是 `140.0.7339.80`。 */
function versionMatches(
	wanted: string | null | undefined,
	actual: string | null
): boolean {
	if (wanted === null || wanted === undefined || wanted === "") {
		return true;
	}
	if (actual === null) {
		// 本机版本读不出来时不算命中：宁可回落到配置的那个 bin，也不要声称
		// 「我这台机器上的这个就是 140」——那种谎话要等测试跑出诡异结果才被发现。
		return false;
	}
	return actual === wanted || actual.startsWith(`${wanted}.`);
}

/**
 * 选二进制。**未点名、或点名了但清单里没中，一律回落**到配置的 chrome bin。
 *
 * 回落而不是报错，是因为清单是「上一次探测的快照」：运维刚装上一个新版本、
 * 还没点「重新探测」的窗口里，让会话照常跑起来，比让它失败正确得多。
 * 真正必须拦下的只有一种——点名要的根本不是 chromium 系，那不是快照过期，
 * 是这台机器**永远**做不到的事。
 */
export function pickBrowserBin(input: PickBrowserBinInput): string {
	const wanted = input.browserName?.trim().toLowerCase();
	if (wanted === undefined || wanted === "") {
		return input.fallback();
	}
	if (!CHROMIUM_FAMILY.has(wanted)) {
		throw new Error(
			`local 后端只能驱动 chromium 系浏览器（chromedriver 的边界），但收到的是「${input.browserName}」。` +
				`可用的名字：${[...CHROMIUM_FAMILY].join(" / ")}；要跑别的浏览器，请把这条会话派到提供它的节点。`
		);
	}
	const hit = input.browsers?.find(
		(entry) =>
			entry.available &&
			entry.bin !== undefined &&
			entry.name === wanted &&
			versionMatches(input.browserVersion, entry.version)
	);
	return hit?.bin ?? input.fallback();
}

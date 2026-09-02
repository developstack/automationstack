/**
 * W3C capabilities 的读写，**全部是纯函数**（plan §5.1 / §10）。
 *
 * 为什么值得单独一个文件外加重点单测：这里有三件一旦写错就没有任何东西会报警
 * 的事——
 *
 * 1. **剥除 `as:options`**。它里面是 `as_live_*` token 明文。漏剥一处，token
 *    就随 caps 进了容器、进了 chromedriver 日志、还会被原样存进
 *    `farm_sessions.requested_capabilities` 供会话详情页展示（schema 那一列的
 *    注释点名了这件事）。这类泄露不会让任何测试变红，也不会让任何请求失败。
 * 2. **caps 有两个位置**。W3C 的 `alwaysMatch` 与 `firstMatch[]` 是「共同要求」
 *    与「候选之一」，客户端把东西放哪边全凭它自己的心情：selenium-webdriver
 *    的 Node 版默认往 `firstMatch[0]` 里塞 browserName，Python 版塞 alwaysMatch。
 *    只处理一边，就是「换个语言客户端就不认了」。
 * 3. **注入 `--remote-debugging-port`**。少了它 recorder 挂不上去，会话照跑，
 *    只是一个产物都录不到——静默降级，用户过几天才会发现。
 *
 * 这些函数一律**不改入参**，返回新对象：转发给上游的 body 与存进库的 caps 是
 * 同一份数据的两种加工结果（一份注入了 debugging port，一份没有），共享可变
 * 状态就会让两者互相污染。
 */

/** 平台私有的 capability 扩展键（D7）。前缀 `as:` 是 W3C 允许的厂商命名空间。 */
export const AS_OPTIONS_KEY = "as:options";

/** Chromium 的厂商 capability 键，args 就挂在它下面。 */
export const CHROME_OPTIONS_KEY = "goog:chromeOptions";

export const DEBUGGING_PORT_FLAG = "--remote-debugging-port";

/**
 * 客户端经 `as:options` 传给平台的那一组参数（D7）。
 *
 * `token` / `projectId` 必填，`name` / `externalRef` 纯展示与预留关联，
 * 缺了不影响会话成立。
 */
export interface AsOptions {
	/** Phase D 预留：这条会话属于哪次自动化执行。不校验存在性（见 schema 注释）。 */
	externalRef?: string;
	/** 人类可读名，落 `farm_sessions.label`。 */
	name?: string;
	/**
	 * 点名要跑在哪个**槽位来源**上（plan §12）：一台实机节点的名字，或者内建
	 * 伪节点 `local`。缺省 = 不点名，由 farm 按占用率自己挑。
	 *
	 * 与同为可选的 `name` / `externalRef` 不同，它**不是展示字段**：它一路传到
	 * `acquire`，点不中就是一条明确的失败（`nodes/pick-source.ts`）。写成
	 * 「点不中就退回自动调度」是更糟的设计——点名的动机通常是「那台机器上有
	 * 我要的设备/证书」，悄悄换一台跑出来的结果是错的，而且没人会发现。
	 */
	node?: string;
	projectId: string;
	token: string;
}

/**
 * 三种结局必须分开，因为给用户的话完全不同：没传是「你漏了接入配置」，
 * 传坏了是「你的 token/projectId 字段不对」，而两者都不是「鉴权失败」。
 */
export type AsOptionsExtraction =
	| { kind: "invalid"; message: string }
	| { kind: "missing" }
	| { kind: "ok"; options: AsOptions };

export interface W3cCapabilities {
	alwaysMatch?: Record<string, unknown>;
	firstMatch?: Record<string, unknown>[];
}

/** create-session 的请求体。除 `capabilities` 外的字段原样透传，不认也不改。 */
export interface NewSessionBody {
	capabilities?: W3cCapabilities;
}

export function asRecord(value: unknown): Record<string, unknown> | null {
	return typeof value === "object" && value !== null && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

export function capabilitiesOf(body: unknown): W3cCapabilities {
	const caps = asRecord(asRecord(body)?.capabilities);
	if (caps === null) {
		return {};
	}
	const firstMatch = Array.isArray(caps.firstMatch)
		? caps.firstMatch.map(asRecord).filter((entry) => entry !== null)
		: undefined;
	const alwaysMatch = asRecord(caps.alwaysMatch) ?? undefined;
	return { alwaysMatch, firstMatch };
}

/**
 * 两个位置合成一条**查找顺序**：alwaysMatch 在前，firstMatch 按数组顺序在后。
 *
 * 这个顺序就是 W3C 的合并语义（alwaysMatch 是共同要求，firstMatch 是候选），
 * 所有「从 caps 里读一个值」的函数都走它，不各写各的遍历。
 */
function capabilitySlots(caps: W3cCapabilities): Record<string, unknown>[] {
	const slots: Record<string, unknown>[] = [];
	if (caps.alwaysMatch) {
		slots.push(caps.alwaysMatch);
	}
	slots.push(...(caps.firstMatch ?? []));
	return slots;
}

function optionalString(value: unknown): string | undefined {
	return typeof value === "string" && value.length > 0 ? value : undefined;
}

function parseAsOptions(raw: Record<string, unknown>): AsOptionsExtraction {
	const token = optionalString(raw.token);
	const projectId = optionalString(raw.projectId);
	if (!(token && projectId)) {
		return {
			kind: "invalid",
			message: "as:options 必须同时包含非空的 token 与 projectId",
		};
	}
	const options: AsOptions = { projectId, token };
	const name = optionalString(raw.name);
	if (name !== undefined) {
		options.name = name;
	}
	const externalRef = optionalString(raw.externalRef);
	if (externalRef !== undefined) {
		options.externalRef = externalRef;
	}
	const node = optionalString(raw.node);
	if (node !== undefined) {
		options.node = node;
	}
	return { kind: "ok", options };
}

/**
 * 从 create-session 的 body 里取 `as:options`。
 *
 * 取**第一个出现的**（alwaysMatch 优先）：客户端在两处都放的情况下，
 * 两份内容不一致本身就是配置错误，选一个确定的位置比合并它们诚实得多。
 */
export function extractAsOptions(body: unknown): AsOptionsExtraction {
	for (const slot of capabilitySlots(capabilitiesOf(body))) {
		const raw = asRecord(slot[AS_OPTIONS_KEY]);
		if (raw !== null) {
			return parseAsOptions(raw);
		}
		if (AS_OPTIONS_KEY in slot) {
			return { kind: "invalid", message: "as:options 必须是一个对象" };
		}
	}
	return { kind: "missing" };
}

function withoutAsOptions(
	slot: Record<string, unknown>
): Record<string, unknown> {
	if (!(AS_OPTIONS_KEY in slot)) {
		return slot;
	}
	const copy = { ...slot };
	delete copy[AS_OPTIONS_KEY];
	return copy;
}

/**
 * 剥除**每一处** `as:options`（两个位置都扫，见文件头第 1 条）。
 *
 * 返回新 body，原对象不动。转发给上游与入库用的都必须是这个结果。
 */
export function stripAsOptions<T extends NewSessionBody>(body: T): T {
	const caps = capabilitiesOf(body);
	const stripped: W3cCapabilities = {};
	if (caps.alwaysMatch) {
		stripped.alwaysMatch = withoutAsOptions(caps.alwaysMatch);
	}
	if (caps.firstMatch) {
		stripped.firstMatch = caps.firstMatch.map(withoutAsOptions);
	}
	return { ...body, capabilities: stripped };
}

export interface BrowserRequest {
	/** 如 `chromium`；客户端没写就是 null，由调度侧决定默认值。 */
	browserName: string | null;
	/** 如 `140`；null = 不挑版本，走目录里的 default。 */
	browserVersion: string | null;
}

/** 客户端点了名要哪个浏览器。两个位置都找，取第一个非空值。 */
export function resolveBrowserRequest(body: unknown): BrowserRequest {
	let browserName: string | null = null;
	let browserVersion: string | null = null;
	for (const slot of capabilitySlots(capabilitiesOf(body))) {
		browserName ??= optionalString(slot.browserName) ?? null;
		browserVersion ??= optionalString(slot.browserVersion) ?? null;
	}
	return { browserName, browserVersion };
}

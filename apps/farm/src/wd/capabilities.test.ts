import { describe, expect, it } from "vitest";

import {
	AS_OPTIONS_KEY,
	CHROME_OPTIONS_KEY,
	extractAsOptions,
	type NewSessionBody,
	resolveBrowserRequest,
	stripAsOptions,
} from "./capabilities";
import { injectSlotArgs } from "./slot-args";

/**
 * 这里钉的是三件「写错了不会有任何东西报警」的事（见 `capabilities.ts` 文件头）：
 * token 泄露、只认一个 caps 位置、debugging port 没注进去。
 *
 * 每条用例都刻意用**两种 caps 摆法**跑一遍：alwaysMatch（Python / Java 客户端的
 * 默认）与 firstMatch（Node 版 selenium-webdriver 的默认）。只测一种等于只支持
 * 一半的客户端。
 */

const AS_OPTIONS = {
	externalRef: "exec-1",
	name: "冒烟",
	projectId: "11111111-1111-1111-1111-111111111111",
	token: "as_live_secret",
};

const bodyWithAlwaysMatch = () => ({
	capabilities: {
		alwaysMatch: {
			[AS_OPTIONS_KEY]: { ...AS_OPTIONS },
			browserName: "chromium",
			browserVersion: "140",
		},
	},
});

const bodyWithFirstMatch = () => ({
	capabilities: {
		alwaysMatch: {},
		firstMatch: [
			{
				[AS_OPTIONS_KEY]: { ...AS_OPTIONS },
				browserName: "chromium",
			},
		],
	},
});

describe("extractAsOptions", () => {
	it("从 alwaysMatch 里取出完整的 as:options", () => {
		const result = extractAsOptions(bodyWithAlwaysMatch());
		expect(result).toEqual({ kind: "ok", options: AS_OPTIONS });
	});

	it("从 firstMatch 条目里取出 as:options", () => {
		const result = extractAsOptions(bodyWithFirstMatch());
		expect(result).toEqual({ kind: "ok", options: AS_OPTIONS });
	});

	it("完全没有 as:options 时回 missing 而不是 invalid", () => {
		expect(extractAsOptions({ capabilities: { alwaysMatch: {} } })).toEqual({
			kind: "missing",
		});
		expect(extractAsOptions({})).toEqual({ kind: "missing" });
	});

	it("as:options 不是对象时回 invalid", () => {
		const result = extractAsOptions({
			capabilities: { alwaysMatch: { [AS_OPTIONS_KEY]: "as_live_x" } },
		});
		expect(result.kind).toBe("invalid");
	});

	it("缺 token 或 projectId 时回 invalid", () => {
		const noToken = extractAsOptions({
			capabilities: { alwaysMatch: { [AS_OPTIONS_KEY]: { projectId: "p" } } },
		});
		const noProject = extractAsOptions({
			capabilities: { alwaysMatch: { [AS_OPTIONS_KEY]: { token: "t" } } },
		});
		expect(noToken.kind).toBe("invalid");
		expect(noProject.kind).toBe("invalid");
	});

	it("可选字段缺席时不编造空串", () => {
		const result = extractAsOptions({
			capabilities: {
				alwaysMatch: { [AS_OPTIONS_KEY]: { projectId: "p", token: "t" } },
			},
		});
		expect(result).toEqual({
			kind: "ok",
			options: { projectId: "p", token: "t" },
		});
	});

	it("alwaysMatch 与 firstMatch 都有时取 alwaysMatch（合并顺序）", () => {
		const result = extractAsOptions({
			capabilities: {
				alwaysMatch: { [AS_OPTIONS_KEY]: { projectId: "p1", token: "t1" } },
				firstMatch: [{ [AS_OPTIONS_KEY]: { projectId: "p2", token: "t2" } }],
			},
		});
		expect(result).toEqual({
			kind: "ok",
			options: { projectId: "p1", token: "t1" },
		});
	});
});

describe("stripAsOptions", () => {
	it("剥掉 alwaysMatch 里的 as:options，其余 caps 原样保留", () => {
		const stripped = stripAsOptions(bodyWithAlwaysMatch());
		expect(stripped.capabilities.alwaysMatch).toEqual({
			browserName: "chromium",
			browserVersion: "140",
		});
	});

	it("剥掉每一个 firstMatch 条目里的 as:options", () => {
		const stripped = stripAsOptions({
			capabilities: {
				firstMatch: [
					{ [AS_OPTIONS_KEY]: { ...AS_OPTIONS }, browserName: "chromium" },
					{ [AS_OPTIONS_KEY]: { ...AS_OPTIONS }, browserName: "firefox" },
				],
			},
		});
		expect(stripped.capabilities.firstMatch).toEqual([
			{ browserName: "chromium" },
			{ browserName: "firefox" },
		]);
	});

	it("剥完之后整份 body 的任何角落都不再出现 token", () => {
		const stripped = stripAsOptions({
			capabilities: {
				alwaysMatch: { [AS_OPTIONS_KEY]: { ...AS_OPTIONS } },
				firstMatch: [{ [AS_OPTIONS_KEY]: { ...AS_OPTIONS } }],
			},
		});
		expect(JSON.stringify(stripped)).not.toContain("as_live_secret");
	});

	it("不改动入参（转发用与入库用是同一份数据的两种加工）", () => {
		const original = bodyWithAlwaysMatch();
		stripAsOptions(original);
		expect(original.capabilities.alwaysMatch[AS_OPTIONS_KEY]).toEqual(
			AS_OPTIONS
		);
	});
});

describe("resolveBrowserRequest", () => {
	it("从 alwaysMatch 读出 browserName 与 browserVersion", () => {
		expect(resolveBrowserRequest(bodyWithAlwaysMatch())).toEqual({
			browserName: "chromium",
			browserVersion: "140",
		});
	});

	it("从 firstMatch 读出，没写的那一项是 null", () => {
		expect(resolveBrowserRequest(bodyWithFirstMatch())).toEqual({
			browserName: "chromium",
			browserVersion: null,
		});
	});

	it("什么都没写时两项都是 null（由调度侧决定默认值）", () => {
		expect(resolveBrowserRequest({})).toEqual({
			browserName: null,
			browserVersion: null,
		});
	});
});

/** 从一份 caps 里把某个位置的 chrome args 取出来，测试里反复用到。 */
function argsOf(slot: Record<string, unknown> | undefined): unknown {
	const chrome = slot?.[CHROME_OPTIONS_KEY] as { args?: unknown } | undefined;
	return chrome?.args;
}

/** 一个「Docker 那样的」槽位：端口固定 9222，不额外要求任何启动参数。 */
const SLOT = { browserArgs: [], cdpDebugPort: 9222 };

describe("injectSlotArgs", () => {
	it("caps 全空时在 alwaysMatch 里新建 goog:chromeOptions", () => {
		// 显式给类型参数：泛型返回 T，字面量 `{}` 会把 capabilities 推没。
		const injected = injectSlotArgs<NewSessionBody>({}, SLOT);
		expect(argsOf(injected.capabilities?.alwaysMatch)).toEqual([
			"--remote-debugging-port=9222",
		]);
	});

	it("alwaysMatch 已有 chromeOptions 时注在那儿，且保留原有 args", () => {
		const injected = injectSlotArgs(
			{
				capabilities: {
					alwaysMatch: { [CHROME_OPTIONS_KEY]: { args: ["--headless=new"] } },
					firstMatch: [{ browserName: "chromium" }],
				},
			},
			SLOT
		);
		expect(argsOf(injected.capabilities.alwaysMatch)).toEqual([
			"--headless=new",
			"--remote-debugging-port=9222",
		]);
		// 同一个键不能同时出现在两边，否则 W3C 合并直接判 invalid argument。
		expect(injected.capabilities.firstMatch[0]).toEqual({
			browserName: "chromium",
		});
	});

	it("只有 firstMatch 时每个条目都注（不知道上游会选中哪个）", () => {
		const injected = injectSlotArgs(
			{
				capabilities: {
					firstMatch: [{ browserName: "chromium" }, { browserName: "chrome" }],
				},
			},
			SLOT
		);
		expect(argsOf(injected.capabilities.firstMatch[0])).toEqual([
			"--remote-debugging-port=9222",
		]);
		expect(argsOf(injected.capabilities.firstMatch[1])).toEqual([
			"--remote-debugging-port=9222",
		]);
		// 断言的是「键不存在」而不是「值是 undefined」：W3C 合并按键是否存在判，
		// `alwaysMatch: undefined` 会被 `in` 判成写了一个空的 alwaysMatch。
		expect("alwaysMatch" in injected.capabilities).toBe(false);
	});

	it("客户端已经指定过端口时原样不动（重复 flag 会让 chromium 起不来）", () => {
		const injected = injectSlotArgs(
			{
				capabilities: {
					alwaysMatch: {
						[CHROME_OPTIONS_KEY]: { args: ["--remote-debugging-port=9333"] },
					},
				},
			},
			SLOT
		);
		expect(argsOf(injected.capabilities.alwaysMatch)).toEqual([
			"--remote-debugging-port=9333",
		]);
	});

	it("端口按槽位给的值走（本地 provider 每条会话一个端口）", () => {
		const injected = injectSlotArgs<NewSessionBody>(
			{},
			{ browserArgs: [], cdpDebugPort: 41_337 }
		);
		expect(argsOf(injected.capabilities?.alwaysMatch)).toEqual([
			"--remote-debugging-port=41337",
		]);
	});

	it("槽位额外要求的参数一并注入，客户端写过的那一个跳过", () => {
		const injected = injectSlotArgs(
			{
				capabilities: {
					alwaysMatch: {
						[CHROME_OPTIONS_KEY]: { args: ["--user-data-dir=/tmp/mine"] },
					},
				},
			},
			{
				browserArgs: ["--user-data-dir=/slots/s1/profile", "--headless=new"],
				cdpDebugPort: 9222,
			}
		);
		expect(argsOf(injected.capabilities.alwaysMatch)).toEqual([
			"--user-data-dir=/tmp/mine",
			"--remote-debugging-port=9222",
			"--headless=new",
		]);
	});

	it("不改动入参", () => {
		const original = { capabilities: { alwaysMatch: {} } };
		injectSlotArgs(original, SLOT);
		expect(original.capabilities.alwaysMatch).toEqual({});
	});
});

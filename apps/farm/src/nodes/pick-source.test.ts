import { parseImageBrowser } from "@automationstack/browser-slots";
import { describe, expect, it } from "vitest";

import { pickSource } from "./pick-source";
import type { BrowserRequirement, BrowserSummary } from "./source-capability";
import type { SourceUsage } from "./source-registry";

/**
 * 选源策略与镜像翻译的纯逻辑用例。
 *
 * 这两块被单独拆成纯函数，就是为了能像下面这样用字面量问清楚：
 * 「点名到一台没上线的机器会得到什么话」不需要先起一个 WebSocket。
 */

/** 占用率那组用例统一要 chrome，能不能满足由下面两个构造器决定。 */
const ANY_CHROME: BrowserRequirement = {
	browserName: "chrome",
	browserVersion: null,
};

/**
 * 后端取 docker：docker 源以镜像库为真相、恒过能力闸门，于是这一组用例问的
 * 就纯是占用率策略本身，不会被能力筛选串味。
 */
function usage(
	name: string,
	active: number,
	capacity: number,
	kind: "builtin" | "node" = "node"
): SourceUsage {
	return { active, backend: "docker", browsers: null, capacity, kind, name };
}

/** local 源：能力就是它自己报的那份，于是能被筛掉。 */
function localUsage(name: string, browsers: BrowserSummary[]): SourceUsage {
	return {
		active: 0,
		backend: "local",
		browsers,
		capacity: 4,
		kind: "node",
		name,
	};
}

describe("pickSource：自动模式", () => {
	it("占用率最低者胜（而不是绝对空闲数最多者）", () => {
		// node-big 空闲 4 个但已用一半，node-small 只空 1 个却只用了 1/2… 的一半。
		const picked = pickSource(
			[usage("node-big", 4, 8), usage("node-small", 1, 4)],
			undefined,
			ANY_CHROME
		);
		expect(picked).toEqual({ name: "node-small", ok: true });
	});

	it("平手归内建：数据面少穿一条隧道", () => {
		const picked = pickSource(
			[usage("node-a", 0, 4), usage("local", 0, 4, "builtin")],
			undefined,
			ANY_CHROME
		);
		expect(picked).toEqual({ name: "local", ok: true });
	});

	it("满了的源不参与竞争", () => {
		const picked = pickSource(
			[usage("local", 2, 2, "builtin"), usage("node-a", 3, 4)],
			undefined,
			ANY_CHROME
		);
		expect(picked).toEqual({ name: "node-a", ok: true });
	});

	it("容量 0 的源永远选不中（不是除零，也不是「占用率 0 最空」）", () => {
		const picked = pickSource([usage("broken", 0, 0)], undefined, ANY_CHROME);
		expect(picked.ok).toBe(false);
	});

	it("全满时给一句能读的话，而不是抛一个错误码", () => {
		const picked = pickSource(
			[usage("local", 2, 2, "builtin"), usage("node-a", 4, 4)],
			undefined,
			ANY_CHROME
		);
		expect(picked.ok).toBe(false);
		if (!picked.ok) {
			expect(picked.message).toContain("都已用满");
		}
	});

	it("一个源都没有时也不抛", () => {
		const picked = pickSource([], undefined, ANY_CHROME);
		expect(picked.ok).toBe(false);
	});

	it("空字符串的 hint 当成没点名", () => {
		const picked = pickSource(
			[usage("local", 0, 1, "builtin")],
			"",
			ANY_CHROME
		);
		expect(picked).toEqual({ name: "local", ok: true });
	});
});

describe("pickSource：点名模式", () => {
	const usages = [usage("local", 0, 4, "builtin"), usage("node-a", 2, 2)];

	it("点中在线且有空位的源", () => {
		expect(pickSource(usages, "local", ANY_CHROME)).toEqual({
			name: "local",
			ok: true,
		});
	});

	it("点名不在线：不静默回退到别的源", () => {
		const picked = pickSource(usages, "node-b", ANY_CHROME);
		expect(picked.ok).toBe(false);
		if (!picked.ok) {
			expect(picked.message).toContain("node-b");
			expect(picked.message).toContain("未在线");
		}
	});

	it("点名已满：和「不在线」说成两句话，因为客户端该做的事不同", () => {
		const picked = pickSource(usages, "node-a", ANY_CHROME);
		expect(picked.ok).toBe(false);
		if (!picked.ok) {
			expect(picked.message).toContain("已用满");
			expect(picked.message).toContain("2/2");
		}
	});
});

describe("pickSource：能力筛选", () => {
	const chrome141: BrowserSummary[] = [
		{ name: "chrome", versions: ["141.0.7390.65"] },
	];

	it("要的浏览器只有一个源有，就算它更忙也选它", () => {
		const picked = pickSource(
			[
				localUsage("only-firefox", [{ name: "firefox", versions: ["128"] }]),
				localUsage("has-chrome", chrome141),
			],
			undefined,
			ANY_CHROME
		);
		expect(picked).toEqual({ name: "has-chrome", ok: true });
	});

	it("版本前缀匹配：要 141 能命中 141.0.7390.65", () => {
		const picked = pickSource([localUsage("a", chrome141)], undefined, {
			browserName: "Chrome",
			browserVersion: "141",
		});
		expect(picked).toEqual({ name: "a", ok: true });
	});

	it("前缀不到点上不算命中：要 14 不该命中 141", () => {
		const picked = pickSource([localUsage("a", chrome141)], undefined, {
			browserName: "chrome",
			browserVersion: "14",
		});
		expect(picked.ok).toBe(false);
	});

	it("chromium 系互认：目录行说 chromium，机器只报 chrome，照样算命中", () => {
		const picked = pickSource([localUsage("a", chrome141)], undefined, {
			browserName: "chromium",
			browserVersion: "latest",
		});
		expect(picked).toEqual({ name: "a", ok: true });
	});

	it("latest 是「哪个版本都行」的 tag，不是一个版本号", () => {
		const picked = pickSource(
			[localUsage("a", [{ name: "chrome", versions: [] }])],
			undefined,
			{ browserName: "chrome", browserVersion: "latest" }
		);
		expect(picked.ok).toBe(true);
	});

	it("一个源都不满足时，把各源能提供什么摆出来", () => {
		const picked = pickSource([localUsage("a", chrome141)], undefined, {
			browserName: "firefox",
			browserVersion: null,
		});
		expect(picked.ok).toBe(false);
		if (!picked.ok) {
			expect(picked.message).toContain("firefox");
			expect(picked.message).toContain("chrome 141.0.7390.65");
		}
	});

	it("没报过能力的 local 源不满足任何请求（「还不知道」不等于「有」）", () => {
		const picked = pickSource(
			[{ ...localUsage("a", []), browsers: null }],
			undefined,
			ANY_CHROME
		);
		expect(picked.ok).toBe(false);
	});

	it("docker 源恒满足：它的真相是 farm 的镜像库，不是这份清单", () => {
		const picked = pickSource([usage("d", 0, 4)], undefined, {
			browserName: "firefox",
			browserVersion: "128",
		});
		expect(picked).toEqual({ name: "d", ok: true });
	});

	it("点名到提供不了的源：说「它没有」，而不是「稍后重试」", () => {
		const picked = pickSource([localUsage("a", chrome141)], "a", {
			browserName: "firefox",
			browserVersion: null,
		});
		expect(picked.ok).toBe(false);
		if (!picked.ok) {
			expect(picked.message).toContain("提供不了");
			expect(picked.message).not.toContain("稍后重试");
		}
	});
});

describe("parseImageBrowser", () => {
	it("目录行的标准命名", () => {
		expect(parseImageBrowser("automationstack-browser-chromium:140")).toEqual({
			browserName: "chromium",
			browserVersion: "140",
		});
	});

	it("latest 与无 tag 都是「哪个版本都行」", () => {
		expect(
			parseImageBrowser("browser-firefox:latest").browserVersion
		).toBeNull();
		expect(parseImageBrowser("browser-firefox").browserVersion).toBeNull();
	});

	it("registry 前缀里的端口不会被当成 tag", () => {
		expect(
			parseImageBrowser("registry.local:5000/as-browser-webkit:18")
		).toEqual({
			browserName: "webkit",
			browserVersion: "18",
		});
	});

	it("解析不出名字时退回 chromium，绝不抛", () => {
		expect(parseImageBrowser(":140")).toEqual({
			browserName: "chromium",
			browserVersion: "140",
		});
	});
});

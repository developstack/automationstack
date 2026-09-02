import { describe, expect, it } from "vitest";
import {
	normalizeConsoleApiCalled,
	normalizeExceptionThrown,
	normalizeFrameNavigated,
	normalizeLogEntryAdded,
} from "./normalize";
import { FIXED_NOW, makeContext } from "./normalize-test-context";

/**
 * `Runtime.*` / `Log.*` / `Page.frameNavigated` 的归一化。
 *
 * 从 `normalize.test.ts` 拆出来：那份文件到了 341 行、越过了仓库 300 行的上限
 * （scripts/check-file-rules.js）。切在这里而不是别处，是与被测代码同一条缝：
 * 这几组用例盯的是 `normalize-runtime.ts` 与 `normalize-page.ts`——它们的共同
 * 点是都不经时钟换算（前者的时间戳已是 epoch ms，后者干脆没有时间戳）。
 */

describe("normalizeConsoleApiCalled", () => {
	it("RemoteObject 只取 value/description，且不递归；只留栈顶帧", () => {
		const event = normalizeConsoleApiCalled(
			{
				args: [
					{ type: "string", value: "hello" },
					{ type: "number", value: 42 },
					{ description: "Error: boom", type: "object" },
					{ type: "symbol" },
				],
				stackTrace: {
					callFrames: [
						{ functionName: "run", lineNumber: 12, url: "https://a/app.js" },
						{
							functionName: "outer",
							lineNumber: 1,
							url: "https://a/vendor.js",
						},
					],
				},
				timestamp: 1_700_000_123_456,
				type: "error",
			},
			makeContext()
		);

		expect(event.ts).toBe(1_700_000_123_456);
		expect(event.data.args).toEqual(["hello", 42, "Error: boom", "symbol"]);
		expect(event.data.frame).toEqual({ line: 12, url: "https://a/app.js" });
		expect(event.data.level).toBe("error");
	});

	it("没有栈时 frame 为 null", () => {
		const event = normalizeConsoleApiCalled(
			{ timestamp: 1, type: "log" },
			makeContext()
		);

		expect(event.data.frame).toBeNull();
		expect(event.data.args).toEqual([]);
	});
});

describe("normalizeExceptionThrown", () => {
	it("留完整栈帧的 url/line/function", () => {
		const event = normalizeExceptionThrown(
			{
				exceptionDetails: {
					exception: { description: "TypeError: x is not a function" },
					stackTrace: {
						callFrames: [
							{ functionName: "a", lineNumber: 3, url: "https://a/1.js" },
							{ lineNumber: 9, url: "https://a/2.js" },
						],
					},
					text: "Uncaught",
				},
				timestamp: 1_700_000_000_001,
			},
			makeContext()
		);

		expect(event.data.text).toBe("Uncaught");
		expect(event.data.description).toBe("TypeError: x is not a function");
		expect(event.data.frames).toEqual([
			{ function: "a", line: 3, url: "https://a/1.js" },
			{ function: "", line: 9, url: "https://a/2.js" },
		]);
	});
});

describe("normalizeLogEntryAdded", () => {
	it("ts 直接用 entry.timestamp（已是 epoch ms）", () => {
		const event = normalizeLogEntryAdded(
			{
				entry: {
					level: "error",
					source: "network",
					text: "Failed to load resource",
					timestamp: 1_700_000_222_000,
					url: "https://example.com/x.png",
				},
			},
			makeContext()
		);

		expect(event.ts).toBe(1_700_000_222_000);
		expect(event.data).toEqual({
			level: "error",
			source: "network",
			text: "Failed to load resource",
			timestamp: 1_700_000_222_000,
			url: "https://example.com/x.png",
		});
	});
});

describe("normalizeFrameNavigated", () => {
	it("主 frame 记为导航锚点，时间用收到时刻", () => {
		const event = normalizeFrameNavigated(
			{ frame: { id: "F1", url: "https://example.com/page" } },
			makeContext()
		);

		expect(event).not.toBeNull();
		expect(event?.ts).toBe(FIXED_NOW);
		expect(event?.data).toEqual({
			frameId: "F1",
			timestamp: FIXED_NOW,
			url: "https://example.com/page",
		});
	});

	it("子 frame 直接丢弃", () => {
		const event = normalizeFrameNavigated(
			{ frame: { id: "F2", parentId: "F1", url: "https://ads.example/i" } },
			makeContext()
		);

		expect(event).toBeNull();
	});
});

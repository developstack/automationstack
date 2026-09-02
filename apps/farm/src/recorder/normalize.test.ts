import { describe, expect, it } from "vitest";
import {
	createRecorderClock,
	normalizeRequestWillBeSent,
	POST_DATA_MAX_CHARS,
	RECORDER_EVENT_TYPE,
} from "./normalize";
import { FIXED_NOW, makeContext } from "./normalize-test-context";

/**
 * 时钟标定，以及唯一会触发标定的那类事件（requestWillBeSent）。
 *
 * 原本一个文件装下全部归一化用例，到了 341 行、越过了仓库 300 行的上限
 * （scripts/check-file-rules.js），于是按事件族拆开：其余 `Network.*` 在
 * `normalize-network.test.ts`，`Runtime.*`/`Log.*`/`Page.*` 在
 * `normalize-runtime.test.ts`，共用的上下文夹具在 `normalize-test-context.ts`。
 */

describe("recorder clock", () => {
	it("标定前回落到当前时刻，标定后按偏移换算单调时间", () => {
		const clock = createRecorderClock(() => FIXED_NOW);

		expect(clock.toEpochMs(1000)).toBe(FIXED_NOW);

		// monotonic 1000s ↔ wall 1_700_000_000s，偏移 = 1_699_999_000s
		clock.calibrate(1000, 1_700_000_000);
		expect(clock.toEpochMs(1002.5)).toBe(1_700_000_002_500);
	});

	it("只标定一次，后续标定不会让时间轴跳变", () => {
		const clock = createRecorderClock(() => FIXED_NOW);
		clock.calibrate(1000, 1_700_000_000);
		clock.calibrate(2000, 1_800_000_000);

		expect(clock.toEpochMs(1000)).toBe(1_700_000_000_000);
	});

	it("忽略非法标定值", () => {
		const clock = createRecorderClock(() => FIXED_NOW);
		clock.calibrate(Number.NaN, 1_700_000_000);
		clock.calibrate(1000, 0);

		expect(clock.toEpochMs(1000)).toBe(FIXED_NOW);
	});
});

describe("normalizeRequestWillBeSent", () => {
	const baseParams = {
		initiator: { type: "parser" },
		request: {
			headers: { "content-type": "application/json" },
			method: "POST",
			url: "https://example.com/api?q=1",
		},
		requestId: "REQ-1",
		timestamp: 1000,
		wallTime: 1_700_000_000,
	};

	it("挑白名单字段，ts 用 wallTime 换算，并顺手标定时钟", () => {
		const ctx = makeContext();
		const event = normalizeRequestWillBeSent(baseParams, ctx);

		expect(event.type).toBe(RECORDER_EVENT_TYPE.requestWillBeSent);
		expect(event.targetId).toBe("TARGET-1");
		expect(event.ts).toBe(1_700_000_000_000);
		expect(event.data).toEqual({
			headers: { "content-type": "application/json" },
			initiatorType: "parser",
			method: "POST",
			requestId: "REQ-1",
			timestamp: 1000,
			url: "https://example.com/api?q=1",
			wallTime: 1_700_000_000,
		});
		// 同一个 ctx 的时钟已被这条事件标定
		expect(ctx.clock.toEpochMs(1001)).toBe(1_700_000_001_000);
	});

	it("postData 超过 4096 字符时截断并标记", () => {
		const postData = "x".repeat(POST_DATA_MAX_CHARS + 10);
		const event = normalizeRequestWillBeSent(
			{ ...baseParams, request: { ...baseParams.request, postData } },
			makeContext()
		);

		expect(event.data.postData).toHaveLength(POST_DATA_MAX_CHARS);
		expect(event.data.postDataTruncated).toBe(true);
	});

	it("postData 未超限时不打 truncated 标记", () => {
		const event = normalizeRequestWillBeSent(
			{ ...baseParams, request: { ...baseParams.request, postData: "a=1" } },
			makeContext()
		);

		expect(event.data.postData).toBe("a=1");
		expect(event.data.postDataTruncated).toBeUndefined();
	});

	it("带 redirectResponse 时只留 url/status/headers", () => {
		const event = normalizeRequestWillBeSent(
			{
				...baseParams,
				redirectResponse: {
					headers: { location: "https://example.com/final" },
					status: 302,
					url: "https://example.com/start",
				},
			},
			makeContext()
		);

		expect(event.data.redirectResponse).toEqual({
			headers: { location: "https://example.com/final" },
			status: 302,
			url: "https://example.com/start",
		});
	});

	it("initiator 缺失时给 other，headers 缺失时给空对象", () => {
		const event = normalizeRequestWillBeSent(
			{
				request: { method: "GET", url: "https://example.com/" },
				requestId: "REQ-2",
				timestamp: 1,
				wallTime: 1_700_000_000,
			},
			makeContext()
		);

		expect(event.data.initiatorType).toBe("other");
		expect(event.data.headers).toEqual({});
	});
});

import { describe, expect, it } from "vitest";
import {
	normalizeLoadingFailed,
	normalizeLoadingFinished,
	normalizeResponseReceived,
	RECORDER_EVENT_TYPE,
} from "./normalize";
import { makeContext } from "./normalize-test-context";

/**
 * `Network.*` 里除 requestWillBeSent 外那三类事件的归一化。
 *
 * 从 `normalize.test.ts` 拆出来：那份文件到了 341 行、越过了仓库 300 行的上限
 * （scripts/check-file-rules.js）。切在这里而不是别处，是与被测代码同一条缝：
 * 这几组用例盯的是 `normalize-network.ts`（requestWillBeSent 留在
 * `normalize.test.ts`，它和时钟标定是一件事）。
 */

describe("normalizeResponseReceived", () => {
	it("挑字段并原样保留 timing", () => {
		const ctx = makeContext();
		ctx.clock.calibrate(1000, 1_700_000_000);
		const event = normalizeResponseReceived(
			{
				requestId: "REQ-1",
				response: {
					headers: { "content-type": "text/html" },
					mimeType: "text/html",
					remoteIPAddress: "93.184.216.34",
					status: 200,
					statusText: "OK",
					timing: { requestTime: 1000.1, sendEnd: 12 },
				},
				timestamp: 1001,
			},
			ctx
		);

		expect(event.ts).toBe(1_700_000_001_000);
		expect(event.data).toEqual({
			headers: { "content-type": "text/html" },
			mimeType: "text/html",
			remoteIPAddress: "93.184.216.34",
			requestId: "REQ-1",
			status: 200,
			statusText: "OK",
			timestamp: 1001,
			timing: { requestTime: 1000.1, sendEnd: 12 },
		});
	});

	it("timing 缺失时落 null 而不是 undefined（JSON 里 undefined 会消失）", () => {
		const event = normalizeResponseReceived(
			{ requestId: "R", response: { status: 204 }, timestamp: 1 },
			makeContext()
		);

		expect(event.data.timing).toBeNull();
		expect(event.data.mimeType).toBe("");
	});
});

describe("normalizeLoadingFinished / normalizeLoadingFailed", () => {
	it("loadingFinished 取 encodedDataLength 与时间戳", () => {
		const event = normalizeLoadingFinished(
			{ encodedDataLength: 2048, requestId: "R", timestamp: 1002 },
			makeContext()
		);

		expect(event.type).toBe(RECORDER_EVENT_TYPE.loadingFinished);
		expect(event.data).toEqual({
			encodedDataLength: 2048,
			requestId: "R",
			timestamp: 1002,
		});
	});

	it("loadingFailed 取 errorText 与 canceled", () => {
		const event = normalizeLoadingFailed(
			{
				canceled: true,
				errorText: "net::ERR_ABORTED",
				requestId: "R",
				timestamp: 3,
			},
			makeContext()
		);

		expect(event.data).toEqual({
			canceled: true,
			errorText: "net::ERR_ABORTED",
			requestId: "R",
			timestamp: 3,
		});
	});
});

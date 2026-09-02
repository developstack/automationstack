import { describe, expect, it } from "vitest";
import { buildHar } from "./har";
import {
	envelope,
	finishedEvent,
	requestEvent,
	responseEvent,
	toNdjson,
} from "./har-test-fixtures";
import { RECORDER_EVENT_TYPE } from "./normalize";

/**
 * entry 组装里「一条输入变多条输出」和「输入本来就残缺」这两类用例。
 *
 * 从 `har.test.ts` 拆出来：那份文件到了 355 行、越过了仓库 300 行的上限
 * （scripts/check-file-rules.js）。切在这里而不是别处，是与被测代码同一条缝：
 * 这两组用例盯的都是 `har-entries.ts`。
 */

describe("buildHar 重定向链", () => {
	const redirected = requestEvent({
		redirectResponse: {
			headers: { location: "https://example.com/final" },
			status: 302,
			url: "https://example.com/?q=1&x=2",
		},
		timestamp: 1000.2,
		url: "https://example.com/final",
		wallTime: 1_700_000_000.2,
	});

	const har = buildHar(
		toNdjson(requestEvent(), redirected, responseEvent(), finishedEvent())
	);

	it("同一 requestId 的 N 跳拆成 N 个 entry", () => {
		expect(har.log.entries).toHaveLength(2);
		expect(har.log.entries[0]?.request.url).toBe(
			"https://example.com/?q=1&x=2"
		);
		expect(har.log.entries[1]?.request.url).toBe("https://example.com/final");
	});

	it("前置 entry 的响应取下一跳的 redirectResponse", () => {
		const [first] = har.log.entries;
		expect(first?.response.status).toBe(302);
		expect(first?.response.redirectURL).toBe("https://example.com/final");
		expect(first?.time).toBe(200);
		// 重定向响应没留 timing，分段只能全 -1
		expect(first?.timings.wait).toBe(-1);
	});

	it("最后一跳才用 responseReceived / loadingFinished", () => {
		expect(har.log.entries[1]?.response.status).toBe(200);
		expect(har.log.entries[1]?.time).toBe(300);
	});

	it("乱序落盘时按时间还原重定向顺序", () => {
		const shuffled = buildHar(
			toNdjson(finishedEvent(), responseEvent(), redirected, requestEvent())
		);

		expect(shuffled.log.entries.map((item) => item.response.status)).toEqual([
			302, 200,
		]);
	});
});

describe("buildHar 异常与残缺", () => {
	it("loadingFailed 的 entry：status=0 + _error", () => {
		const har = buildHar(
			toNdjson(
				requestEvent(),
				envelope(RECORDER_EVENT_TYPE.loadingFailed, 1_700_000_000_300, {
					canceled: true,
					errorText: "net::ERR_CONNECTION_REFUSED",
					requestId: "REQ-1",
					timestamp: 1000.3,
				})
			)
		);
		const [entry] = har.log.entries;

		expect(entry?.response.status).toBe(0);
		expect(entry?.response._error).toBe("net::ERR_CONNECTION_REFUSED");
		expect(entry?.response._canceled).toBe(true);
		expect(entry?.time).toBe(300);
		expect(entry?._incomplete).toBeUndefined();
	});

	it("孤儿请求（只有 requestWillBeSent）标 _incomplete，time 未知", () => {
		const har = buildHar(toNdjson(requestEvent()));
		const [entry] = har.log.entries;

		expect(entry?._incomplete).toBe(true);
		expect(entry?.time).toBe(-1);
		expect(entry?.response.status).toBe(0);
		expect(entry?.timings.wait).toBe(-1);
	});

	it("只有结束事件没有请求事件时整条丢弃，不抛异常", () => {
		const har = buildHar(toNdjson(responseEvent(), finishedEvent()));

		expect(har.log.entries).toHaveLength(0);
	});

	it("空输入产出空但合法的 HAR", () => {
		const har = buildHar("");

		expect(har.log.entries).toHaveLength(0);
		expect(har.log.pages).toHaveLength(0);
	});
});

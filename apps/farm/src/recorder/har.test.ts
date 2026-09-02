import { describe, expect, it } from "vitest";
import { buildHar, parseRecorderEvents } from "./har";
import {
	finishedEvent,
	requestEvent,
	responseEvent,
	toNdjson,
} from "./har-test-fixtures";
import { RECORDER_EVENT_TYPE } from "./normalize";

/**
 * 解析入口与「一条请求走完全程」这条主链路。
 *
 * 原本一个文件装下全部 HAR 用例，到了 355 行、越过了仓库 300 行的上限
 * （scripts/check-file-rules.js），于是按 describe 拆开：重定向与残缺在
 * `har-entries.test.ts`，分页在 `har-pages.test.ts`，共用夹具在
 * `har-test-fixtures.ts`。
 */

describe("parseRecorderEvents", () => {
	it("跳过坏行与缺字段的行，不整体失败", () => {
		const ndjson = [
			"这不是 JSON",
			"",
			"   ",
			"[1,2,3]",
			JSON.stringify({ data: {}, ts: 1 }),
			JSON.stringify({ ts: 1, type: "x" }),
			JSON.stringify(requestEvent()),
			'{"data":{"requestId":"R"},"type":"Network.loading', // 被截断的半行
		].join("\n");

		const events = parseRecorderEvents(ndjson);

		expect(events).toHaveLength(1);
		expect(events[0]?.type).toBe(RECORDER_EVENT_TYPE.requestWillBeSent);
	});
});

describe("buildHar 正常链路", () => {
	const har = buildHar(
		toNdjson(requestEvent(), responseEvent(), finishedEvent())
	);
	const [entry] = har.log.entries;

	it("creator 与版本按约定写死", () => {
		expect(har.log.version).toBe("1.2");
		expect(har.log.creator).toEqual({
			name: "automationstack-farm",
			version: "1",
		});
	});

	it("四事件合成一个 entry，startedDateTime 用 wallTime", () => {
		expect(har.log.entries).toHaveLength(1);
		expect(entry?.startedDateTime).toBe(
			new Date(1_700_000_000_000).toISOString()
		);
		expect(entry?._requestId).toBe("REQ-1");
		expect(entry?._incomplete).toBeUndefined();
	});

	it("time 用单调时间戳差值（结束 - 开始）", () => {
		expect(entry?.time).toBe(500);
	});

	it("request 侧：headers 转数组、queryString 从 url 解析", () => {
		expect(entry?.request.method).toBe("GET");
		expect(entry?.request.headers).toEqual([
			{ name: "user-agent", value: "chrome" },
		]);
		expect(entry?.request.queryString).toEqual([
			{ name: "q", value: "1" },
			{ name: "x", value: "2" },
		]);
		expect(entry?.request.bodySize).toBe(0);
		expect(entry?.request.postData).toBeUndefined();
	});

	it("response 侧：bodySize 用 encodedDataLength，content.size 未知", () => {
		expect(entry?.response.status).toBe(200);
		expect(entry?.response.statusText).toBe("OK");
		expect(entry?.response.bodySize).toBe(1234);
		expect(entry?.response.content).toEqual({
			mimeType: "text/html",
			size: -1,
		});
		expect(entry?.serverIPAddress).toBe("1.2.3.4");
	});

	it("timings 各段按 CDP timing 换算，未采集的 blocked 保持 -1", () => {
		expect(entry?.timings).toEqual({
			blocked: -1,
			connect: 15,
			dns: 5,
			// (1000.5s → 1000500ms) - (requestTime 1000.05s → 1000050ms + 60ms)
			receive: 390,
			send: 2,
			ssl: 10,
			wait: 38,
		});
	});

	it("timing 缺段时给 -1 而不是 0", () => {
		const har2 = buildHar(
			toNdjson(
				requestEvent(),
				responseEvent({
					timing: { requestTime: 1000.05, sendEnd: 22, sendStart: 20 },
				}),
				finishedEvent()
			)
		);

		expect(har2.log.entries[0]?.timings).toEqual({
			blocked: -1,
			connect: -1,
			dns: -1,
			receive: -1,
			send: 2,
			ssl: -1,
			wait: -1,
		});
	});

	it("有 postData 时带上 mimeType 与截断标记", () => {
		const har2 = buildHar(
			toNdjson(
				requestEvent({
					headers: { "content-type": "application/json" },
					method: "POST",
					postData: '{"a":1}',
					postDataTruncated: true,
				}),
				responseEvent(),
				finishedEvent()
			)
		);

		expect(har2.log.entries[0]?.request.postData).toEqual({
			_truncated: true,
			mimeType: "application/json",
			text: '{"a":1}',
		});
		expect(har2.log.entries[0]?.request.bodySize).toBe(7);
	});
});

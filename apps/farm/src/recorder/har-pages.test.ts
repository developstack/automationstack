import { describe, expect, it } from "vitest";
import { buildHar } from "./har";
import {
	finishedEvent,
	navigationEvent,
	requestEvent,
	responseEvent,
	toNdjson,
} from "./har-test-fixtures";

/**
 * pages 分段与 entry 的页面归属。
 *
 * 从 `har.test.ts` 拆出来：那份文件到了 355 行、越过了仓库 300 行的上限
 * （scripts/check-file-rules.js）。切在这里而不是别处，是与被测代码同一条缝：
 * 这一组用例盯的是 `har-pages.ts`。
 */

describe("buildHar pages 分段", () => {
	const har = buildHar(
		toNdjson(
			requestEvent({
				requestId: "A",
				timestamp: 1000,
				wallTime: 1_700_000_000,
			}),
			navigationEvent(1_700_000_000_500, "https://example.com/first"),
			requestEvent({
				requestId: "B",
				timestamp: 1005,
				wallTime: 1_700_000_005,
			}),
			navigationEvent(1_700_000_010_000, "https://example.com/second"),
			requestEvent({ requestId: "C", timestamp: 1011, wallTime: 1_700_000_011 })
		)
	);

	it("每次主 frame 导航一页，title 用 url", () => {
		expect(har.log.pages.map((page) => page.id)).toEqual(["page_0", "page_1"]);
		expect(har.log.pages[0]?.title).toBe("https://example.com/first");
		expect(har.log.pages[0]?.startedDateTime).toBe(
			new Date(1_700_000_000_500).toISOString()
		);
	});

	it("entry 按开始时刻归属，早于首次导航的主文档也归 page_0", () => {
		const byRequestId = new Map(
			har.log.entries.map((entry) => [entry._requestId, entry.pageref])
		);

		expect(byRequestId.get("A")).toBe("page_0");
		expect(byRequestId.get("B")).toBe("page_0");
		expect(byRequestId.get("C")).toBe("page_1");
	});

	it("entries 按开始时间排序", () => {
		expect(har.log.entries.map((entry) => entry._requestId)).toEqual([
			"A",
			"B",
			"C",
		]);
	});

	it("一次导航都没有时不编造 page，entry 也不带 pageref", () => {
		const har2 = buildHar(
			toNdjson(requestEvent(), responseEvent(), finishedEvent())
		);

		expect(har2.log.pages).toHaveLength(0);
		expect(har2.log.entries[0]?.pageref).toBeUndefined();
	});
});

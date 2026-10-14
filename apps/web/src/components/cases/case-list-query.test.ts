import { describe, expect, it } from "vitest";

import { caseRange } from "@/components/cases/case-list-query";

describe("caseRange：列表底部显示当前页是第几条到第几条", () => {
	it.each([
		["第 1 页显示第 1 到第 20 条", 1, 135, { first: 1, last: 20 }],
		["中间的页按每页 20 条计算", 2, 135, { first: 21, last: 40 }],
		["最后一页只到总条数", 7, 135, { first: 121, last: 135 }],
		["没有用例时是第 0 到第 0 条", 1, 0, { first: 0, last: 0 }],
	])("%s", (_name, page, total, range) => {
		expect(caseRange(page, total)).toEqual(range);
	});
});

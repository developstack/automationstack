import { describe, expect, it } from "vitest";

import { caseRange } from "@/components/cases/case-list-query";

describe("caseRange：列表底部显示当前页是第几条到第几条", () => {
	it("第 1 页显示第 1 到第 20 条", () => {
		expect(caseRange(1, 135)).toEqual({ first: 1, last: 20 });
	});

	it("中间的页按每页 20 条计算", () => {
		expect(caseRange(2, 135)).toEqual({ first: 21, last: 40 });
	});

	it("最后一页只到总条数", () => {
		expect(caseRange(7, 135)).toEqual({ first: 121, last: 135 });
	});

	it("没有用例时是第 0 到第 0 条", () => {
		expect(caseRange(1, 0)).toEqual({ first: 0, last: 0 });
	});
});

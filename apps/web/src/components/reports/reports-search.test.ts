import { describe, expect, it } from "vitest";

import {
	isFilteredReportSearch,
	reportListInput,
	reportsSearchSchema,
} from "@/components/reports/reports-search";

const USER_ID = "00000000-0000-4000-8000-000000000001";

describe("reportListInput", () => {
	it("from 是当天本地 0 点，to 是下一天本地 0 点", () => {
		const input = reportListInput("p1", {
			from: "2026-03-01",
			to: "2026-03-31",
		});
		expect(input.submittedFrom).toEqual(new Date(2026, 2, 1));
		expect(input.submittedBefore).toEqual(new Date(2026, 3, 1));
	});

	it("没有 from 和 to 时保持 undefined，其他条件原样传入", () => {
		expect(
			reportListInput("p1", { kw: "冒烟", page: 2, submitter: "system" })
		).toEqual({
			keyword: "冒烟",
			page: 2,
			projectId: "p1",
			submittedBefore: undefined,
			submittedFrom: undefined,
			submitter: "system",
		});
	});
});

describe("reportsSearchSchema", () => {
	it.each([
		["日期格式不对", { from: "2026/03/01", to: "昨天" }],
		["页码不是正整数", { page: 0 }],
		["页码不是整数", { page: 1.5 }],
		["提交人既不是 uuid 也不是 system", { submitter: "alice" }],
	])("%s：忽略这个条件，不报错", (_name, raw) => {
		expect(reportsSearchSchema.parse(raw)).toEqual({});
	});

	it("合法的值保留", () => {
		const raw = {
			from: "2026-03-01",
			kw: "a",
			page: 3,
			submitter: USER_ID,
			to: "2026-03-02",
		};
		expect(reportsSearchSchema.parse(raw)).toEqual(raw);
	});
});

describe("isFilteredReportSearch", () => {
	it.each([
		[{}, false],
		[{ page: 3 }, false],
		[{ kw: "a" }, true],
		[{ submitter: "system" }, true],
		[{ from: "2026-03-01" }, true],
		[{ to: "2026-03-01" }, true],
	])("%j → %s", (search, filtered) => {
		expect(isFilteredReportSearch(search)).toBe(filtered);
	});
});

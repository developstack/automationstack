import type { MemberWorkload } from "@automationstack/db/repositories/project-stats-workload-core";
import { describe, expect, it } from "vitest";

import {
	periodFrom,
	workloadBarScale,
	workloadSummary,
} from "@/components/overview/workload-meta";

const MEMBERS: MemberWorkload[] = [
	{
		last7Days: { created: 1, executed: 3 },
		last30Days: { created: 5, executed: 12 },
		userId: "u1",
		username: "alice",
	},
	{
		last7Days: { created: 0, executed: 0 },
		last30Days: { created: 0, executed: 4 },
		userId: "u2",
		username: "bob",
	},
];

describe("workloadBarScale", () => {
	it.each([
		{ marks: [0, 5, 10], values: [0, 5, 10], widths: [0, 50, 100] },
		{ marks: [30, 15, 0], values: [300, 150, 0], widths: [100, 50, 0] },
		{ marks: [28, 10], values: [305, 100], widths: [100, (10 / 28) * 100] },
		{ marks: [0], values: [0], widths: [0] },
	])("$values 的竖线数是 $marks", ({ marks, values, widths }) => {
		const scale = workloadBarScale(values);

		expect(values.map(scale.marksFor)).toEqual(marks);
		for (const [index, value] of values.entries()) {
			expect(scale.widthPercentFor(value)).toBeCloseTo(widths[index] ?? 0, 5);
		}
	});
});

describe("workloadSummary", () => {
	it.each([
		{ expected: "近 30 天共执行 16 条、新建 5 条用例", period: "last30Days" },
		{ expected: "近 7 天共执行 3 条、新建 1 条用例", period: "last7Days" },
	] as const)("$period：$expected", ({ expected, period }) => {
		expect(workloadSummary(MEMBERS, period)).toBe(expected);
	});
});

describe("periodFrom", () => {
	it.each([
		{ current: "last30Days", expected: "last30Days", group: [] },
		{ current: "last30Days", expected: "last7Days", group: ["last7Days"] },
		{ current: "last7Days", expected: "last7Days", group: ["unknown"] },
	] as const)(
		"$group 时从 $current 变为 $expected",
		({ current, expected, group }) => {
			expect(periodFrom([...group], current)).toBe(expected);
		}
	);
});

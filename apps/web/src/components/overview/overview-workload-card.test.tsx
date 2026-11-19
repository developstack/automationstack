import type { WorkloadStats } from "@automationstack/db/repositories/project-stats-workload-core";
import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { OverviewWorkloadCard } from "@/components/overview/overview-workload-card";
import { renderWithQuery } from "@/test-dom-fixtures";

const WORKLOAD_KEY = ["projectStats", "memberWorkload"];

vi.mock("@/utils/orpc", () => ({
	orpc: {
		projectStats: {
			memberWorkload: {
				queryOptions: () => ({
					queryFn: () => Promise.resolve({ members: [] }),
					queryKey: WORKLOAD_KEY,
				}),
			},
		},
	},
}));

const WORKLOAD: WorkloadStats = {
	members: [
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
	],
};

function numbersOf(username: string): string[] {
	return within(screen.getByRole("row", { name: new RegExp(username) }))
		.getAllByRole("cell")
		.map((cell) => cell.textContent ?? "");
}

function numbers(): string[][] {
	return ["alice", "bob"].map(numbersOf);
}

const LAST_30_DAYS = [
	["12", "5"],
	["4", "0"],
];
const LAST_7_DAYS = [
	["3", "1"],
	["0", "0"],
];
const SUMMARY_30_DAYS = "近 30 天共执行 16 条、新建 5 条用例";
const SUMMARY_PATTERN = /共执行/;
const SUMMARY_7_DAYS = "近 7 天共执行 3 条、新建 1 条用例";

function renderCard(data: WorkloadStats) {
	renderWithQuery(<OverviewWorkloadCard projectId="p1" />, [
		WORKLOAD_KEY,
		data,
	]);
}

describe("OverviewWorkloadCard", () => {
	it("默认显示近 30 天的数字，点击「近 7 天」切换，再点击已按下的选项时保持不变", () => {
		renderCard(WORKLOAD);
		expect(numbers()).toEqual(LAST_30_DAYS);
		expect(screen.getByText(SUMMARY_30_DAYS)).toBeDefined();

		fireEvent.click(screen.getByRole("button", { name: "近 7 天" }));
		expect(numbers()).toEqual(LAST_7_DAYS);
		expect(screen.getByText(SUMMARY_7_DAYS)).toBeDefined();

		fireEvent.click(screen.getByRole("button", { name: "近 7 天" }));
		expect(numbers()).toEqual(LAST_7_DAYS);
		expect(
			screen
				.getByRole("button", { name: "近 7 天" })
				.getAttribute("aria-pressed")
		).toBe("true");

		fireEvent.click(screen.getByRole("button", { name: "近 30 天" }));
		expect(numbers()).toEqual(LAST_30_DAYS);
	});

	it("表头是成员、执行、新建用例", () => {
		renderCard(WORKLOAD);

		expect(
			screen.getAllByRole("columnheader").map((header) => header.textContent)
		).toEqual(["成员", "执行", "新建用例"]);
		expect(screen.getByRole("button", { name: "统计口径" })).toBeDefined();
	});

	it("没有成员时显示提示，不显示表格", () => {
		renderCard({ members: [] });

		expect(screen.getByText("项目中还没有成员。")).toBeDefined();
		expect(screen.queryByRole("table")).toBeNull();
		expect(screen.queryByText(SUMMARY_PATTERN)).toBeNull();
	});
});

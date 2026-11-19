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
// 图表是懒加载的 Recharts。测试只检查给屏幕阅读器的列表。
vi.mock("@/components/overview/overview-lazy-charts", () => ({
	LazyMemberWorkloadChart: () => null,
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

const PANELS = ["执行", "新建用例"];

function listOf(title: string): string[] {
	const panel = screen.getByRole("heading", { name: title }).closest("section");
	if (panel === null) {
		throw new Error(`没有找到「${title}」面板`);
	}
	return within(panel)
		.getAllByRole("listitem")
		.map((item) => item.textContent ?? "");
}

function lists(): string[][] {
	return PANELS.map(listOf);
}

const LAST_30_DAYS = [
	["alice：12", "bob：4"],
	["alice：5", "bob：0"],
];
const LAST_7_DAYS = [
	["alice：3", "bob：0"],
	["alice：1", "bob：0"],
];

function renderCard(data: WorkloadStats) {
	renderWithQuery(<OverviewWorkloadCard projectId="p1" />, [
		WORKLOAD_KEY,
		data,
	]);
}

describe("OverviewWorkloadCard", () => {
	it("默认显示近 30 天的数字，点击「近 7 天」切换，再点击已按下的选项时保持不变", () => {
		renderCard(WORKLOAD);
		expect(lists()).toEqual(LAST_30_DAYS);

		fireEvent.click(screen.getByRole("button", { name: "近 7 天" }));
		expect(lists()).toEqual(LAST_7_DAYS);

		fireEvent.click(screen.getByRole("button", { name: "近 7 天" }));
		expect(lists()).toEqual(LAST_7_DAYS);
		expect(
			screen
				.getByRole("button", { name: "近 7 天" })
				.getAttribute("aria-pressed")
		).toBe("true");

		fireEvent.click(screen.getByRole("button", { name: "近 30 天" }));
		expect(lists()).toEqual(LAST_30_DAYS);
	});

	it("没有成员时显示提示，不显示面板", () => {
		renderCard({ members: [] });

		expect(screen.getByText("项目中还没有成员。")).toBeDefined();
		expect(screen.queryByRole("heading", { name: "执行" })).toBeNull();
	});
});

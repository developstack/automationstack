import type { SubmittedReportItem } from "@automationstack/db/repositories/test-run-report-list-repository";
import type { TestRun } from "@automationstack/db/schema/test-runs";
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ReportTable } from "@/components/reports/report-table";
import { renderRoutes } from "@/test-dom-fixtures";

const PROJECT_ID = "00000000-0000-4000-8000-000000000001";
const RUN_ID = "00000000-0000-4000-8000-000000000002";

function makeItem(
	run: Partial<TestRun>,
	submittedByName: string | null
): SubmittedReportItem {
	return {
		counts: {
			blocked: 1,
			failed: 2,
			passed: 6,
			skipped: 0,
			total: 10,
			untested: 1,
		},
		run: {
			id: RUN_ID,
			name: "回归",
			projectId: PROJECT_ID,
			submittedAt: new Date("2026-10-01T08:00:00Z"),
			submittedBy: null,
			...run,
		} as TestRun,
		submittedByName,
	};
}

async function renderTable(item: SubmittedReportItem) {
	renderRoutes({
		initialPath: "/list",
		routes: { "/list": () => <ReportTable items={[item]} /> },
	});
	await screen.findByRole("table");
}

describe("ReportTable", () => {
	it("名称链接到报告页，显示用例数、通过率、失败和阻塞", async () => {
		await renderTable(makeItem({ submittedBy: "u1" }, "alice"));
		expect(
			screen.getByRole("link", { name: "回归" }).getAttribute("href")
		).toBe(`/projects/${PROJECT_ID}/reports/${RUN_ID}`);
		expect(screen.getByText("alice")).toBeTruthy();
		const cells = screen.getAllByRole("cell").map((cell) => cell.textContent);
		expect(cells.slice(3)).toEqual(["10", "75%", "2", "1"]);
	});

	it.each([
		["没有提交人：系统自动提交", null, null, "系统自动提交"],
		["账号已删除", "u1", null, "已删除的账号"],
	])("%s", async (_name, submittedBy, name, label) => {
		await renderTable(makeItem({ submittedBy }, name));
		expect(screen.getByText(label)).toBeTruthy();
	});
});

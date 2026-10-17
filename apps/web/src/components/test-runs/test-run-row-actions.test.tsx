import type { TestRunListItem } from "@automationstack/db/repositories/test-runs-repository";
import type { TestRunStatus } from "@automationstack/db/schema/test-runs";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TestRunRowActions } from "@/components/test-runs/test-run-row-actions";
import { openMenuItems } from "@/test-dom-fixtures";

vi.mock("@/components/test-runs/create-from-failed-dialog", () => ({
	CreateFromFailedDialog: () => null,
}));
vi.mock("@/components/test-runs/use-test-run-list-mutations", () => ({
	useRemoveTestRun: () => ({ isPending: false, mutate: vi.fn() }),
}));

const RUN_NAME = "回归测试";
const TRIGGER_NAME = `测试任务「${RUN_NAME}」操作`;
const CREATED_AT = new Date("2026-01-01T00:00:00Z");

function listItem(status: TestRunStatus, failed: number): TestRunListItem {
	return {
		counts: {
			blocked: 0,
			failed,
			passed: 0,
			skipped: 0,
			total: failed,
			untested: 0,
		},
		createdByName: null,
		run: {
			completedAt: null,
			createdAt: CREATED_AT,
			createdBy: null,
			description: null,
			id: "44444444-4444-4444-8444-444444444444",
			name: RUN_NAME,
			projectId: "55555555-5555-4555-8555-555555555555",
			reviewedAt: null,
			reviewedBy: null,
			startedAt: null,
			status,
			submittedAt: status === "submitted" ? CREATED_AT : null,
			submittedBy: null,
			updatedAt: CREATED_AT,
		},
	};
}

describe("TestRunRowActions：菜单里只有能用的操作", () => {
	it.each<[string, TestRunStatus, number, string[]]>([
		[
			"进行中、有失败用例：三项都能用",
			"in_progress",
			2,
			["编辑", "从失败用例创建", "删除"],
		],
		[
			"没有失败用例：没有「从失败用例创建」",
			"in_progress",
			0,
			["编辑", "删除"],
		],
		["已提交：没有「编辑」和「删除」", "submitted", 2, ["从失败用例创建"]],
	])("%s", async (_name, status, failed, items) => {
		render(
			<TestRunRowActions item={listItem(status, failed)} onEdit={vi.fn()} />
		);
		expect(await openMenuItems(TRIGGER_NAME)).toEqual(items);
	});

	it("已提交、没有失败用例：一项都不能用，不显示「更多操作」按钮", () => {
		render(
			<TestRunRowActions item={listItem("submitted", 0)} onEdit={vi.fn()} />
		);
		expect(screen.queryByRole("button", { name: TRIGGER_NAME })).toBeNull();
	});
});

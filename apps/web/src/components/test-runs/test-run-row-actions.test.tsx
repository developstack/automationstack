import type { RunViewer } from "@automationstack/api/lib/test-run-access";
import type { TestRunListItem } from "@automationstack/db/repositories/test-runs-repository";
import type { TestRunStatus } from "@automationstack/db/schema/test-runs";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TestRunRowActions } from "@/components/test-runs/test-run-row-actions";
import { openMenuItems } from "@/test-dom-fixtures";

vi.mock("@/components/test-runs/create-from-failed-dialog", () => ({
	CreateFromFailedDialog: () => null,
}));
vi.mock("@/components/test-runs/void-run-dialog", () => ({
	VoidRunDialog: () => null,
}));
vi.mock("@/components/test-runs/use-run-viewer", () => ({
	useRunViewer: () => viewerState.current,
}));

const CREATOR_ID = "22222222-2222-4222-8222-222222222222";
const creator: RunViewer = {
	platformRole: "member",
	userId: CREATOR_ID,
};
const viewerState = vi.hoisted(() => ({
	current: null as RunViewer | null,
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
			createdBy: CREATOR_ID,
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
			voidedAt: status === "voided" ? CREATED_AT : null,
			voidedBy: null,
			voidReason: null,
		},
	};
}

const otherMember: RunViewer = { ...creator, userId: "other" };
const admin: RunViewer = {
	platformRole: "admin",
	userId: "admin",
};

describe("TestRunRowActions：菜单里只有能用的操作", () => {
	it.each<[string, TestRunStatus, number, RunViewer | null, string[]]>([
		[
			"创建者看测试中、有失败用例：三项都能用，没有「删除」",
			"in_progress",
			2,
			creator,
			["编辑", "从失败用例创建", "作废"],
		],
		[
			"没有失败用例：没有「从失败用例创建」",
			"in_progress",
			0,
			creator,
			["编辑", "作废"],
		],
		["待评审：可以作废", "pending_review", 0, creator, ["编辑", "作废"]],
		["待测试：可以作废", "ready", 0, creator, ["编辑", "作废"]],
		["管理员：可以作废", "ready", 0, admin, ["编辑", "作废"]],
		["其他项目成员：没有「作废」", "in_progress", 0, otherMember, ["编辑"]],
		["成员列表加载中：没有「作废」", "in_progress", 0, null, ["编辑"]],
		["已完成：没有「作废」", "completed", 0, creator, ["编辑"]],
		[
			"已提交：只有「从失败用例创建」",
			"submitted",
			2,
			creator,
			["从失败用例创建"],
		],
		[
			"已作废：只有「从失败用例创建」",
			"voided",
			2,
			creator,
			["从失败用例创建"],
		],
	])("%s", async (_name, status, failed, viewer, items) => {
		viewerState.current = viewer;
		render(
			<TestRunRowActions item={listItem(status, failed)} onEdit={vi.fn()} />
		);
		expect(await openMenuItems(TRIGGER_NAME)).toEqual(items);
	});

	it.each<TestRunStatus>(["submitted", "voided"])(
		"%s、没有失败用例：一项都不能用，不显示「更多操作」按钮",
		(status) => {
			viewerState.current = creator;
			render(<TestRunRowActions item={listItem(status, 0)} onEdit={vi.fn()} />);
			expect(screen.queryByRole("button", { name: TRIGGER_NAME })).toBeNull();
		}
	);
});

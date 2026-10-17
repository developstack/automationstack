import type { ProjectRole } from "@automationstack/db/schema/project-members";
import type { TestCase } from "@automationstack/db/schema/test-cases";
import { call } from "@orpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
	FILTER_BATCH_TOO_MANY_MESSAGE,
	MAX_FILTER_BATCH_CASES,
} from "../schemas/case";
import { callContext, testCaseId as caseId, testUser } from "../test-fixtures";
import { caseRemoveProcedures } from "./case-remove";
import { caseStatusProcedures } from "./case-status";

const mocks = vi.hoisted(() => ({
	changeCaseStatus: vi.fn(),
	changeCaseStatusByFilter: vi.fn(),
	getProjectRole: vi.fn(),
	listCaseProjects: vi.fn(),
	publishInvalidate: vi.fn(),
	removeTestCases: vi.fn(),
	removeTestCasesByFilter: vi.fn(),
}));

vi.mock("@automationstack/db", () => ({ db: {} }));
vi.mock("@automationstack/env/server", () => ({
	env: { SESSION_SECRET: "test-session-secret-0123456789abcdef" },
}));
vi.mock("@automationstack/db/repositories/case-mutations-repository", () => ({
	changeCaseStatus: mocks.changeCaseStatus,
}));
vi.mock("@automationstack/db/repositories/test-cases-repository", () => ({
	removeTestCases: mocks.removeTestCases,
}));
vi.mock(
	"@automationstack/db/repositories/case-filter-batch-repository",
	() => ({
		changeCaseStatusByFilter: mocks.changeCaseStatusByFilter,
		removeTestCasesByFilter: mocks.removeTestCasesByFilter,
	})
);
vi.mock("@automationstack/db/repositories/project-members-repository", () => ({
	getProjectRole: mocks.getProjectRole,
}));
vi.mock("@automationstack/db/repositories/project-scope-repository", () => ({
	listCaseProjects: mocks.listCaseProjects,
}));
vi.mock("../lib/realtime-publish", () => ({
	publishInvalidate: mocks.publishInvalidate,
}));

const PROJECT_ID = "55555555-5555-4555-8555-555555555555";
const MODULE_ID = "77777777-7777-4777-8777-777777777777";
const viewer = testUser({ role: "member", username: "bob" });

/** 用例列表的筛选条件：模块（含子模块）、关键字和状态。 */
const FILTER = {
	includeDescendants: true,
	keyword: "登录",
	moduleId: MODULE_ID,
	projectId: PROJECT_ID,
	status: "draft" as const,
};

function testCase(index: number): TestCase {
	return {
		id: caseId(index),
		moduleId: MODULE_ID,
		name: `用例 ${index}`,
		projectId: PROJECT_ID,
		status: "active",
	} as TestCase;
}

const options = (procedure: string) => ({
	context: callContext(viewer),
	path: ["cases", procedure],
});

function changeAs(projectRole: ProjectRole | null, input: object) {
	mocks.getProjectRole.mockResolvedValue(projectRole);
	return call(
		caseStatusProcedures.changeStatus,
		input as never,
		options("changeStatus")
	);
}

function removeAs(projectRole: ProjectRole | null, input: object) {
	mocks.getProjectRole.mockResolvedValue(projectRole);
	return call(
		caseRemoveProcedures.removeMany,
		input as never,
		options("removeMany")
	);
}

type Procedure = "changeStatus" | "removeMany";

const byFilter: Record<Procedure, ReturnType<typeof vi.fn>> = {
	changeStatus: mocks.changeCaseStatusByFilter,
	removeMany: mocks.removeTestCasesByFilter,
};

function runByFilter(procedure: Procedure, projectRole: ProjectRole | null) {
	return procedure === "changeStatus"
		? changeAs(projectRole, { filter: FILTER, status: "deprecated" })
		: removeAs(projectRole, { filter: FILTER });
}

beforeEach(() => {
	vi.clearAllMocks();
});

describe("按筛选条件批量处理：服务端按筛选条件找出用例，不依赖前端传 id", () => {
	it("改状态：按当前符合筛选的用例修改，返回实际修改的用例，通知其他人刷新", async () => {
		const changes = [1, 2].map((index) => ({
			previousStatus: "active",
			testCase: testCase(index),
			version: { version: 2 },
		}));
		mocks.changeCaseStatusByFilter.mockResolvedValue({ changes, kind: "ok" });

		await expect(
			changeAs("member", { filter: FILTER, status: "deprecated" })
		).resolves.toEqual({ changes, undoToken: expect.any(String) });
		expect(mocks.changeCaseStatusByFilter).toHaveBeenCalledWith({
			actorName: "bob",
			filter: FILTER,
			limit: MAX_FILTER_BATCH_CASES,
			status: "deprecated",
		});
		expect(mocks.getProjectRole).toHaveBeenCalledWith(PROJECT_ID, viewer.id);
		expect(mocks.publishInvalidate).toHaveBeenCalledWith(
			expect.objectContaining({
				action: "update",
				ids: [caseId(1), caseId(2)],
				projectId: PROJECT_ID,
			})
		);
	});

	it("删除：被测试任务用到的用例跳过，返回实际删除和跳过的用例", async () => {
		mocks.removeTestCasesByFilter.mockResolvedValue({
			kind: "ok",
			missingIds: [],
			removed: [testCase(1)],
			skipped: [{ referencedByRunCount: 3, testCase: testCase(2) }],
		});

		await expect(removeAs("member", { filter: FILTER })).resolves.toEqual({
			deleted: [{ id: caseId(1), name: "用例 1" }],
			missingIds: [],
			skipped: [{ id: caseId(2), name: "用例 2", referencedByRunCount: 3 }],
		});
		expect(mocks.removeTestCasesByFilter).toHaveBeenCalledWith({
			filter: FILTER,
			limit: MAX_FILTER_BATCH_CASES,
		});
		expect(mocks.publishInvalidate).toHaveBeenCalledWith(
			expect.objectContaining({ action: "delete", ids: [caseId(1)] })
		);
	});

	it.each<Procedure>(["changeStatus", "removeMany"])(
		"%s：符合筛选的用例超过上限时 BAD_REQUEST，提示缩小筛选范围，不通知",
		async (procedure) => {
			byFilter[procedure].mockResolvedValue({ kind: "too-many" });
			await expect(runByFilter(procedure, "member")).rejects.toMatchObject({
				code: "BAD_REQUEST",
				message: FILTER_BATCH_TOO_MANY_MESSAGE,
			});
			expect(mocks.publishInvalidate).not.toHaveBeenCalled();
		}
	);

	it.each<Procedure>(["changeStatus", "removeMany"])(
		"%s：不是筛选条件中项目的成员时 FORBIDDEN，不写数据库",
		async (procedure) => {
			await expect(runByFilter(procedure, null)).rejects.toMatchObject({
				code: "FORBIDDEN",
			});
			expect(byFilter[procedure]).not.toHaveBeenCalled();
		}
	);
});

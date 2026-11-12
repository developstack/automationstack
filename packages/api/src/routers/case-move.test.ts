import type { TestCase } from "@automationstack/db/schema/test-cases";
import { call } from "@orpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
	FILTER_BATCH_TOO_MANY_MESSAGE,
	INVALID_TARGET_MODULE_MESSAGE,
	MAX_FILTER_BATCH_CASES,
} from "../schemas/case";
import { callContext, testUser } from "../test-fixtures";
import { caseMoveProcedures } from "./case-move";

const mocks = vi.hoisted(() => ({
	isProjectMember: vi.fn(),
	listCaseIdsByFilter: vi.fn(),
	listCaseProjects: vi.fn(),
	listModuleFollowingRuns: vi.fn(),
	moveTestCases: vi.fn(),
	moveTestCasesByFilter: vi.fn(),
	publishInvalidate: vi.fn(),
}));

vi.mock("@automationstack/db", () => ({ db: {} }));
vi.mock("@automationstack/db/repositories/case-move-repository", () => ({
	moveTestCases: mocks.moveTestCases,
}));
vi.mock(
	"@automationstack/db/repositories/case-filter-batch-repository",
	() => ({
		listCaseIdsByFilter: mocks.listCaseIdsByFilter,
		moveTestCasesByFilter: mocks.moveTestCasesByFilter,
	})
);
vi.mock("@automationstack/db/repositories/run-case-module", () => ({
	listModuleFollowingRuns: mocks.listModuleFollowingRuns,
}));
vi.mock("@automationstack/db/repositories/project-members-repository", () => ({
	isProjectMember: mocks.isProjectMember,
}));
vi.mock("@automationstack/db/repositories/project-scope-repository", () => ({
	listCaseProjects: mocks.listCaseProjects,
}));
vi.mock("../lib/realtime-publish", () => ({
	publishInvalidate: mocks.publishInvalidate,
}));

const PROJECT_ID = "55555555-5555-4555-8555-555555555555";
const TARGET_ID = "77777777-7777-4777-8777-777777777777";
const LOGIN_ID = "44444444-4444-4444-8444-444444444444";
const LOGOUT_ID = "88888888-8888-4888-8888-888888888888";
const GONE_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const viewer = testUser({ role: "member", username: "bob" });

function testCase(id: string, name: string): TestCase {
	return { id, moduleId: TARGET_ID, name, projectId: PROJECT_ID } as TestCase;
}

const LOGIN = testCase(LOGIN_ID, "登录成功");
const LOGOUT = testCase(LOGOUT_ID, "退出登录");
const FILTER = { projectId: PROJECT_ID, status: "draft" as const };
const RUN_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

type MoveInput = { filter: typeof FILTER } | { ids: string[] };

function moveAs(isMember: boolean, input: MoveInput) {
	mocks.isProjectMember.mockResolvedValue(isMember);
	return call(
		caseMoveProcedures.moveMany,
		{ ...input, moduleId: TARGET_ID },
		{ context: callContext(viewer), path: ["cases", "moveMany"] }
	);
}

function impactOf(input: MoveInput) {
	mocks.isProjectMember.mockResolvedValue(true);
	return call(
		caseMoveProcedures.moveImpact,
		{ ...input, moduleId: TARGET_ID },
		{ context: callContext(viewer), path: ["cases", "moveImpact"] }
	);
}

function existIn(ids: string[]) {
	mocks.listCaseProjects.mockResolvedValue(
		ids.map((caseId) => ({ caseId, projectId: PROJECT_ID }))
	);
}

beforeEach(() => {
	vi.clearAllMocks();
});

describe("cases.moveMany：把用例移到另一个模块", () => {
	it("移动勾选的用例，报告不变和不存在的用例，并通知其他人刷新目标模块", async () => {
		existIn([LOGIN_ID, LOGOUT_ID]);
		mocks.moveTestCases.mockResolvedValue({
			kind: "ok",
			missingIds: [GONE_ID],
			moved: [LOGIN],
			syncedRunIds: [RUN_ID],
			unchanged: [LOGOUT],
		});

		await expect(moveAs(true, { ids: [LOGIN_ID, LOGOUT_ID] })).resolves.toEqual(
			{
				missingIds: [GONE_ID],
				moved: [{ id: LOGIN_ID, name: "登录成功" }],
				syncedRunIds: [RUN_ID],
				unchanged: [{ id: LOGOUT_ID, name: "退出登录" }],
			}
		);
		expect(mocks.moveTestCases).toHaveBeenCalledWith({
			caseIds: [LOGIN_ID, LOGOUT_ID],
			moduleId: TARGET_ID,
		});
		expect(mocks.publishInvalidate).toHaveBeenCalledWith(
			expect.objectContaining({
				action: "move",
				entity: "case",
				ids: [LOGIN_ID],
				moduleId: TARGET_ID,
				projectId: PROJECT_ID,
			})
		);
		// 模块跟着改的测试任务也通知其他人刷新
		expect(mocks.publishInvalidate).toHaveBeenCalledWith(
			expect.objectContaining({
				entity: "testRun",
				ids: [RUN_ID],
				projectId: PROJECT_ID,
			})
		);
	});

	it("全部符合筛选的用例：按筛选条件移动；都已在目标模块中时不通知", async () => {
		mocks.moveTestCasesByFilter.mockResolvedValue({
			kind: "ok",
			missingIds: [],
			moved: [],
			syncedRunIds: [],
			unchanged: [LOGIN],
		});

		await expect(moveAs(true, { filter: FILTER })).resolves.toEqual({
			missingIds: [],
			moved: [],
			syncedRunIds: [],
			unchanged: [{ id: LOGIN_ID, name: "登录成功" }],
		});
		expect(mocks.moveTestCasesByFilter).toHaveBeenCalledWith({
			filter: FILTER,
			limit: MAX_FILTER_BATCH_CASES,
			moduleId: TARGET_ID,
		});
		expect(mocks.publishInvalidate).not.toHaveBeenCalled();
	});

	it.each([
		{ kind: "invalid-module", message: INVALID_TARGET_MODULE_MESSAGE },
		{ kind: "too-many", message: FILTER_BATCH_TOO_MANY_MESSAGE },
	])("仓库返回 $kind：BAD_REQUEST，不通知", async ({ kind, message }) => {
		mocks.moveTestCasesByFilter.mockResolvedValue({ kind });
		await expect(moveAs(true, { filter: FILTER })).rejects.toMatchObject({
			code: "BAD_REQUEST",
			message,
		});
		expect(mocks.publishInvalidate).not.toHaveBeenCalled();
	});

	it.each([
		{ code: "FORBIDDEN", existing: [LOGIN_ID], name: "不是项目成员" },
		{ code: "NOT_FOUND", existing: [], name: "用例不存在" },
	])("$name：$code，不移动", async ({ code, existing }) => {
		existIn(existing);
		await expect(moveAs(false, { ids: [LOGIN_ID] })).rejects.toMatchObject({
			code,
		});
		expect(mocks.moveTestCases).not.toHaveBeenCalled();
	});
});

describe("cases.moveImpact：移动前列出模块会跟着改的测试任务", () => {
	const run = { id: RUN_ID, name: "回归", status: "in_progress" };

	it("勾选的用例：按 id 查找", async () => {
		existIn([LOGIN_ID]);
		mocks.listModuleFollowingRuns.mockResolvedValue([run]);
		await expect(impactOf({ ids: [LOGIN_ID] })).resolves.toEqual({
			runs: [run],
		});
		expect(mocks.listModuleFollowingRuns).toHaveBeenCalledWith(
			[LOGIN_ID],
			TARGET_ID
		);
	});

	it("全部符合筛选的用例：先按筛选条件找出用例；超过上限时 BAD_REQUEST", async () => {
		mocks.listCaseIdsByFilter.mockResolvedValueOnce([LOGIN_ID]);
		mocks.listModuleFollowingRuns.mockResolvedValue([]);
		await expect(impactOf({ filter: FILTER })).resolves.toEqual({ runs: [] });
		expect(mocks.listCaseIdsByFilter).toHaveBeenCalledWith({
			filter: FILTER,
			limit: MAX_FILTER_BATCH_CASES,
		});

		mocks.listCaseIdsByFilter.mockResolvedValueOnce(null);
		await expect(impactOf({ filter: FILTER })).rejects.toMatchObject({
			code: "BAD_REQUEST",
			message: FILTER_BATCH_TOO_MANY_MESSAGE,
		});
	});
});

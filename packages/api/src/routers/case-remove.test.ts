import type { TestCase } from "@automationstack/db/schema/test-cases";
import { call } from "@orpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { MAX_BATCH_CASES } from "../schemas/case";
import { callContext, testUser } from "../test-fixtures";
import { caseRemoveProcedures } from "./case-remove";

const mocks = vi.hoisted(() => ({
	isProjectMember: vi.fn(),
	listCaseProjects: vi.fn(),
	publishInvalidate: vi.fn(),
	removeTestCases: vi.fn(),
}));

vi.mock("@automationstack/db", () => ({ db: {} }));
vi.mock("@automationstack/db/repositories/test-cases-repository", () => ({
	removeTestCases: mocks.removeTestCases,
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
const OTHER_PROJECT_ID = "66666666-6666-4666-8666-666666666666";
const MODULE_ID = "77777777-7777-4777-8777-777777777777";
const OTHER_MODULE_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const LOGIN_ID = "44444444-4444-4444-8444-444444444444";
const LOGOUT_ID = "88888888-8888-4888-8888-888888888888";
const REFUND_ID = "99999999-9999-4999-8999-999999999999";
const GONE_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const viewer = testUser({ role: "member", username: "bob" });

function testCase(id: string, name: string, moduleId = MODULE_ID): TestCase {
	return { id, moduleId, name, projectId: PROJECT_ID } as TestCase;
}

const LOGIN = testCase(LOGIN_ID, "登录成功");
const LOGOUT = testCase(LOGOUT_ID, "退出登录");
const REFUND = testCase(REFUND_ID, "申请退款", OTHER_MODULE_ID);

function existIn(projectId: string, ids: string[]) {
	mocks.listCaseProjects.mockResolvedValue(
		ids.map((caseId) => ({ caseId, projectId }))
	);
}

function removeAs(isMember: boolean, ids: string[]) {
	mocks.isProjectMember.mockResolvedValue(isMember);
	return call(
		caseRemoveProcedures.removeMany,
		{ ids },
		{ context: callContext(viewer), path: ["cases", "removeMany"] }
	);
}

beforeEach(() => {
	vi.clearAllMocks();
});

describe("cases.removeMany：批量删除用例，被测试任务用到的用例跳过", () => {
	interface RemoveRow {
		missingIds?: string[];
		/** 通知中的模块：删除的用例都在同一个模块中时才有。 */
		moduleId?: string;
		name: string;
		removed: TestCase[];
		skipped?: TestCase[];
	}

	it.each<RemoveRow>([
		{
			moduleId: MODULE_ID,
			name: "部分被跳过：删除其余的，通知其他人刷新",
			removed: [LOGIN],
			skipped: [LOGOUT],
		},
		{
			name: "全部被跳过：不删除，也不通知",
			removed: [],
			skipped: [LOGIN, LOGOUT],
		},
		{
			name: "删除的用例分属不同模块：通知中不带模块",
			removed: [LOGIN, REFUND],
		},
		{
			missingIds: [GONE_ID],
			moduleId: MODULE_ID,
			name: "有的用例已经被别人删除：不算失败，报告为不存在，其余照常删除",
			removed: [LOGIN],
		},
	])("$name", async ({ missingIds = [], moduleId, removed, skipped = [] }) => {
		const existing = [...removed, ...skipped].map((item) => item.id);
		const ids = [...existing, ...missingIds];
		existIn(PROJECT_ID, existing);
		mocks.removeTestCases.mockResolvedValue({
			missingIds,
			removed,
			skipped: skipped.map((item) => ({
				referencedByRunCount: 2,
				testCase: item,
			})),
		});

		await expect(removeAs(true, ids)).resolves.toEqual({
			deleted: removed.map(({ id, name }) => ({ id, name })),
			missingIds,
			skipped: skipped.map(({ id, name }) => ({
				id,
				name,
				referencedByRunCount: 2,
			})),
		});
		expect(mocks.removeTestCases).toHaveBeenCalledWith({
			caseIds: ids,
			projectId: PROJECT_ID,
		});
		if (removed.length === 0) {
			expect(mocks.publishInvalidate).not.toHaveBeenCalled();
			return;
		}
		expect(mocks.publishInvalidate).toHaveBeenCalledWith(
			expect.objectContaining({
				action: "delete",
				entity: "case",
				ids: removed.map((item) => item.id),
				moduleId,
				projectId: PROJECT_ID,
			})
		);
	});

	it("所有用例都已经不存在：没有要删除的用例，直接报告为不存在", async () => {
		existIn(PROJECT_ID, []);
		await expect(removeAs(false, [GONE_ID])).resolves.toEqual({
			deleted: [],
			missingIds: [GONE_ID],
			skipped: [],
		});
		expect(mocks.removeTestCases).not.toHaveBeenCalled();
	});

	it.each<{
		code: string;
		ids: string[];
		name: string;
		projectIds: string[];
		isMember: boolean;
	}>([
		{
			code: "NOT_FOUND",
			ids: [LOGIN_ID, LOGOUT_ID],
			isMember: true,
			name: "用例分属不同项目",
			projectIds: [PROJECT_ID, OTHER_PROJECT_ID],
		},
		{
			code: "FORBIDDEN",
			ids: [LOGIN_ID],
			isMember: false,
			name: "不是项目成员",
			projectIds: [PROJECT_ID],
		},
		{
			code: "BAD_REQUEST",
			ids: [],
			isMember: true,
			name: "没有用例",
			projectIds: [],
		},
		{
			code: "BAD_REQUEST",
			ids: Array.from({ length: MAX_BATCH_CASES + 1 }, () => LOGIN_ID),
			isMember: true,
			name: `超过 ${MAX_BATCH_CASES} 条用例`,
			projectIds: [],
		},
	])("$name：$code，不删除", async ({ code, ids, isMember, projectIds }) => {
		mocks.listCaseProjects.mockResolvedValue(
			projectIds.map((projectId, index) => ({ caseId: ids[index], projectId }))
		);
		await expect(removeAs(isMember, ids)).rejects.toMatchObject({ code });
		expect(mocks.removeTestCases).not.toHaveBeenCalled();
	});
});

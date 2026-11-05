import type { ProjectRole } from "@automationstack/db/schema/project-members";
import type {
	CaseStatus,
	TestCase,
} from "@automationstack/db/schema/test-cases";
import { call } from "@orpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { MAX_BATCH_CASES } from "../schemas/case";
import { callContext, testUser } from "../test-fixtures";
import { caseStatusProcedures } from "./case-status";

const mocks = vi.hoisted(() => ({
	changeCaseStatus: vi.fn(),
	getProjectRole: vi.fn(),
	listCaseProjects: vi.fn(),
	publishInvalidate: vi.fn(),
}));

vi.mock("@automationstack/db", () => ({ db: {} }));
vi.mock("@automationstack/env/server", () => ({
	env: { SESSION_SECRET: "test-session-secret-0123456789abcdef" },
}));
vi.mock("@automationstack/db/repositories/case-mutations-repository", () => ({
	changeCaseStatus: mocks.changeCaseStatus,
}));
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
const OTHER_PROJECT_ID = "66666666-6666-4666-8666-666666666666";
const MODULE_ID = "77777777-7777-4777-8777-777777777777";
const CASE_ID = "44444444-4444-4444-8444-444444444444";
const OTHER_CASE_ID = "88888888-8888-4888-8888-888888888888";
const KEPT_CASE_ID = "99999999-9999-4999-8999-999999999999";
const OTHER_MODULE_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const viewer = testUser({ role: "member", username: "bob" });

const testCase = {
	id: CASE_ID,
	moduleId: MODULE_ID,
	projectId: PROJECT_ID,
	status: "deprecated",
} as TestCase;

function changeAs(
	projectRole: ProjectRole | null,
	status: CaseStatus,
	ids = [CASE_ID],
	extra: object = {}
) {
	mocks.getProjectRole.mockResolvedValue(projectRole);
	return call(
		caseStatusProcedures.changeStatus,
		{ ids, status, ...extra },
		{ context: callContext(viewer), path: ["cases", "changeStatus"] }
	);
}

beforeEach(() => {
	vi.clearAllMocks();
	mocks.listCaseProjects.mockResolvedValue([
		{ caseId: CASE_ID, projectId: PROJECT_ID },
	]);
});

describe("cases.changeStatus：只改用例状态，不检查版本", () => {
	it.each<[string, number | null, number]>([
		["状态变化：记录新版本，通知其他人刷新，返回撤销凭证", 6, 1],
		["状态没有变化：不记录版本，不通知，没有撤销凭证", null, 0],
	])("%s", async (_name, version, published) => {
		const change = {
			previousStatus: "active",
			testCase,
			version: version === null ? null : { version },
		};
		mocks.changeCaseStatus.mockResolvedValue({
			changes: [change],
			kind: "ok",
		});

		await expect(changeAs("member", "deprecated")).resolves.toEqual({
			changes: [change],
			undoToken: version === null ? null : expect.any(String),
		});
		expect(mocks.changeCaseStatus).toHaveBeenCalledWith({
			actorName: "bob",
			caseIds: [CASE_ID],
			status: "deprecated",
		});
		expect(mocks.publishInvalidate).toHaveBeenCalledTimes(published);
		if (published > 0) {
			expect(mocks.publishInvalidate).toHaveBeenCalledWith(
				expect.objectContaining({
					action: "update",
					entity: "case",
					ids: [CASE_ID],
					moduleId: MODULE_ID,
					projectId: PROJECT_ID,
				})
			);
		}
	});

	it.each<[string, { caseId: string; projectId: string }[]]>([
		["有一条用例不存在", [{ caseId: CASE_ID, projectId: PROJECT_ID }]],
		[
			"用例分属不同项目",
			[
				{ caseId: CASE_ID, projectId: PROJECT_ID },
				{ caseId: OTHER_CASE_ID, projectId: OTHER_PROJECT_ID },
			],
		],
	])("%s：NOT_FOUND，不写数据库", async (_name, rows) => {
		mocks.listCaseProjects.mockResolvedValue(rows);
		await expect(
			changeAs("member", "draft", [CASE_ID, OTHER_CASE_ID])
		).rejects.toMatchObject({ code: "NOT_FOUND" });
		expect(mocks.changeCaseStatus).not.toHaveBeenCalled();
	});

	it("批量修改：一次写入所有用例，只通知状态变化的用例；分属不同模块时不带模块", async () => {
		const other = { ...testCase, id: OTHER_CASE_ID, moduleId: OTHER_MODULE_ID };
		const kept = { ...testCase, id: KEPT_CASE_ID };
		mocks.listCaseProjects.mockResolvedValue(
			[CASE_ID, OTHER_CASE_ID, KEPT_CASE_ID].map((caseId) => ({
				caseId,
				projectId: PROJECT_ID,
			}))
		);
		mocks.changeCaseStatus.mockResolvedValue({
			changes: [
				{ previousStatus: "active", testCase, version: { version: 2 } },
				{ previousStatus: "draft", testCase: other, version: { version: 3 } },
				{ previousStatus: "deprecated", testCase: kept, version: null },
			],
			kind: "ok",
		});
		const ids = [CASE_ID, OTHER_CASE_ID, KEPT_CASE_ID];

		await changeAs("member", "deprecated", ids);
		expect(mocks.changeCaseStatus).toHaveBeenCalledWith(
			expect.objectContaining({ caseIds: ids })
		);
		expect(mocks.publishInvalidate).toHaveBeenCalledWith(
			expect.objectContaining({
				ids: [CASE_ID, OTHER_CASE_ID],
				moduleId: undefined,
			})
		);
	});

	const tooMany = Array.from({ length: MAX_BATCH_CASES + 1 }, () => CASE_ID);
	it.each<[string, string[], object]>([
		["没有用例", [], {}],
		[`超过 ${MAX_BATCH_CASES} 条用例`, tooMany, {}],
		// 撤销改用 cases.undoStatusChange，旧的 undo 标记不再放宽按 id 修改的上限
		[`带 undo 标记超过 ${MAX_BATCH_CASES} 条用例`, tooMany, { undo: true }],
	])("%s：BAD_REQUEST，不写数据库", async (_name, ids, extra) => {
		await expect(changeAs("member", "draft", ids, extra)).rejects.toMatchObject(
			{
				code: "BAD_REQUEST",
			}
		);
		expect(mocks.changeCaseStatus).not.toHaveBeenCalled();
	});

	it("不是项目成员：FORBIDDEN，不写数据库", async () => {
		await expect(changeAs(null, "draft")).rejects.toMatchObject({
			code: "FORBIDDEN",
		});
		expect(mocks.changeCaseStatus).not.toHaveBeenCalled();
	});

	it("用例在检查权限之后被删除：NOT_FOUND，不通知", async () => {
		mocks.changeCaseStatus.mockResolvedValue({
			kind: "not-found",
			missingIds: [CASE_ID],
		});
		await expect(changeAs("member", "draft")).rejects.toMatchObject({
			code: "NOT_FOUND",
		});
		expect(mocks.publishInvalidate).not.toHaveBeenCalled();
	});
});

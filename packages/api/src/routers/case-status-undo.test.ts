import type { ProjectRole } from "@automationstack/db/schema/project-members";
import type { TestCase } from "@automationstack/db/schema/test-cases";
import { call } from "@orpc/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CASE_STATUS_UNDO_TOKEN_TTL_SECONDS } from "../lib/case-status-undo-token";
import {
	CASE_STATUS_UNDO_EXPIRED_MESSAGE,
	MAX_BATCH_CASES,
	MAX_UNDO_TOKEN_LENGTH,
} from "../schemas/case";
import { callContext, testCaseId as caseId, testUser } from "../test-fixtures";
import { caseStatusProcedures } from "./case-status";

const mocks = vi.hoisted(() => ({
	changeCaseStatusByFilter: vi.fn(),
	getProjectRole: vi.fn(),
	publishInvalidate: vi.fn(),
	undoCaseStatusChange: vi.fn(),
}));

vi.mock("@automationstack/db", () => ({ db: {} }));
vi.mock("@automationstack/env/server", () => ({
	env: { SESSION_SECRET: "test-session-secret-0123456789abcdef" },
}));
vi.mock("@automationstack/db/repositories/case-mutations-repository", () => ({
	changeCaseStatus: vi.fn(),
}));
vi.mock(
	"@automationstack/db/repositories/case-filter-batch-repository",
	() => ({ changeCaseStatusByFilter: mocks.changeCaseStatusByFilter })
);
vi.mock("@automationstack/db/repositories/case-status-undo-repository", () => ({
	undoCaseStatusChange: mocks.undoCaseStatusChange,
}));
vi.mock("@automationstack/db/repositories/project-members-repository", () => ({
	getProjectRole: mocks.getProjectRole,
}));
vi.mock("@automationstack/db/repositories/project-scope-repository", () => ({
	listCaseProjects: vi.fn(),
}));
vi.mock("../lib/realtime-publish", () => ({
	publishInvalidate: mocks.publishInvalidate,
}));

const PROJECT_ID = "55555555-5555-4555-8555-555555555555";
const MODULE_ID = "77777777-7777-4777-8777-777777777777";
const NOW = Date.parse("2026-10-18T08:00:00Z");
const TTL_MS = CASE_STATUS_UNDO_TOKEN_TTL_SECONDS * 1000;
const owner = testUser({ role: "member", username: "bob" });
const stranger = testUser({
	id: "22222222-2222-4222-8222-222222222222",
	role: "member",
	username: "eve",
});

/** 按筛选条件修改的条数，超过按 id 修改的上限。 */
const CHANGED_COUNT = MAX_BATCH_CASES + 50;

function testCase(index: number, status: TestCase["status"]): TestCase {
	return {
		id: caseId(index),
		moduleId: MODULE_ID,
		projectId: PROJECT_ID,
		status,
	} as TestCase;
}

const ids = Array.from({ length: CHANGED_COUNT }, (_, index) => caseId(index));

/** bob 按筛选条件把草稿和生效的用例改为废弃（偶数原来是草稿，奇数原来是生效），返回撤销凭证。 */
async function changeByFilter(): Promise<string> {
	mocks.changeCaseStatusByFilter.mockResolvedValue({
		changes: ids.map((_, index) => ({
			previousStatus: index % 2 === 0 ? "draft" : "active",
			testCase: testCase(index, "deprecated"),
			version: { version: 2 },
		})),
		kind: "ok",
	});
	const { undoToken } = await call(
		caseStatusProcedures.changeStatus,
		{ filter: { projectId: PROJECT_ID }, status: "deprecated" },
		{ context: callContext(owner), path: ["cases", "changeStatus"] }
	);
	if (undoToken === null) {
		throw new Error("按筛选条件修改了用例，应该有撤销凭证");
	}
	return undoToken;
}

function undoAs(
	user: typeof owner,
	token: string,
	projectRole: ProjectRole | null = "member"
) {
	mocks.getProjectRole.mockResolvedValue(projectRole);
	return call(
		caseStatusProcedures.undoStatusChange,
		{ token },
		{ context: callContext(user), path: ["cases", "undoStatusChange"] }
	);
}

beforeEach(() => {
	vi.clearAllMocks();
	vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
	mocks.getProjectRole.mockResolvedValue("member");
	mocks.undoCaseStatusChange.mockResolvedValue({
		changes: [],
		skippedIds: [],
	});
});

afterEach(() => {
	vi.useRealTimers();
});

describe("cases.undoStatusChange：凭撤销凭证恢复这次修改改过的用例", () => {
	it(`按筛选条件修改的 ${CHANGED_COUNT} 条用例一次恢复为各自原来的状态，报告跳过的用例，通知其他人刷新`, async () => {
		const token = await changeByFilter();
		const restored = [
			{
				previousStatus: "deprecated",
				testCase: testCase(0, "draft"),
				version: { version: 3 },
			},
		];
		mocks.undoCaseStatusChange.mockResolvedValue({
			changes: restored,
			skippedIds: [caseId(1)],
		});

		await expect(undoAs(owner, token)).resolves.toEqual({
			changes: restored,
			skippedIds: [caseId(1)],
		});
		expect(mocks.undoCaseStatusChange).toHaveBeenCalledWith({
			actorName: "bob",
			idsByPreviousStatus: {
				active: ids.filter((_, index) => index % 2 === 1),
				draft: ids.filter((_, index) => index % 2 === 0),
			},
			projectId: PROJECT_ID,
			status: "deprecated",
		});
		expect(mocks.getProjectRole).toHaveBeenLastCalledWith(PROJECT_ID, owner.id);
		expect(mocks.publishInvalidate).toHaveBeenLastCalledWith(
			expect.objectContaining({
				action: "update",
				ids: [caseId(0)],
				moduleId: MODULE_ID,
				projectId: PROJECT_ID,
			})
		);
	});

	it("用例都在修改后又被改过：什么都不恢复，也不通知", async () => {
		const token = await changeByFilter();
		mocks.publishInvalidate.mockClear();
		mocks.undoCaseStatusChange.mockResolvedValue({
			changes: [],
			skippedIds: ids,
		});
		await expect(undoAs(owner, token)).resolves.toEqual({
			changes: [],
			skippedIds: ids,
		});
		expect(mocks.publishInvalidate).not.toHaveBeenCalled();
	});

	it.each<{
		code: string;
		message?: string;
		name: string;
		undo: (token: string) => Promise<unknown>;
	}>([
		{
			code: "BAD_REQUEST",
			name: "改过的凭证",
			undo: (token) => undoAs(owner, `${token}x`),
		},
		{
			code: "BAD_REQUEST",
			name: "超过长度上限的凭证",
			undo: () => undoAs(owner, "x".repeat(MAX_UNDO_TOKEN_LENGTH + 1)),
		},
		{
			code: "BAD_REQUEST",
			message: CASE_STATUS_UNDO_EXPIRED_MESSAGE,
			name: "过期的凭证",
			undo: (token) => {
				vi.setSystemTime(NOW + TTL_MS + 1);
				return undoAs(owner, token);
			},
		},
		{
			code: "FORBIDDEN",
			name: "别人的凭证",
			undo: (token) => undoAs(stranger, token),
		},
		{
			code: "FORBIDDEN",
			name: "修改后不再是项目成员",
			undo: (token) => undoAs(owner, token, null),
		},
	])("$name：$code，不写数据库", async ({ code, message, undo }) => {
		const token = await changeByFilter();
		await expect(undo(token)).rejects.toMatchObject(
			message === undefined ? { code } : { code, message }
		);
		expect(mocks.undoCaseStatusChange).not.toHaveBeenCalled();
	});
});

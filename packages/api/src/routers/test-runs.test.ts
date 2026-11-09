import type { TestRun } from "@automationstack/db/schema/test-runs";
import type { UserRole } from "@automationstack/db/schema/users";
import { call } from "@orpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { callContext, testUser } from "../test-fixtures";
import { testRunsRouter } from "./test-runs";

const mocks = vi.hoisted(() => ({
	findTestRun: vi.fn(),
	getTestRunReport: vi.fn(),
	isProjectMember: vi.fn(),
	markTestRunReviewed: vi.fn(),
	publishInvalidate: vi.fn(),
	storage: null as { presignDownload: (key: string) => Promise<string> } | null,
	submitTestRun: vi.fn(),
	unmarkTestRunReviewed: vi.fn(),
	updateTestRun: vi.fn(),
	voidTestRun: vi.fn(),
}));

vi.mock("@automationstack/db", () => ({ db: {} }));
vi.mock("@automationstack/db/repositories/project-members-repository", () => ({
	isProjectMember: mocks.isProjectMember,
}));
vi.mock("@automationstack/db/repositories/project-scope-repository", () => ({
	getProjectIdByRunId: () => Promise.resolve(PROJECT_ID),
}));
vi.mock("@automationstack/db/repositories/test-runs-repository", () => ({
	findTestRun: mocks.findTestRun,
	listTestRuns: vi.fn(),
}));
vi.mock(
	"@automationstack/db/repositories/test-run-mutations-repository",
	() => ({
		createTestRun: vi.fn(),
		createTestRunFromFailed: vi.fn(),
		updateTestRun: mocks.updateTestRun,
	})
);
vi.mock(
	"@automationstack/db/repositories/test-run-transitions-repository",
	() => ({
		markTestRunReviewed: mocks.markTestRunReviewed,
		submitTestRun: mocks.submitTestRun,
		unmarkTestRunReviewed: mocks.unmarkTestRunReviewed,
		voidTestRun: mocks.voidTestRun,
	})
);
vi.mock("@automationstack/db/repositories/test-run-report-repository", () => ({
	getTestRunReport: mocks.getTestRunReport,
}));
vi.mock("../lib/object-storage", () => ({
	getObjectStorage: () => mocks.storage,
}));
vi.mock("../lib/realtime-publish", () => ({
	publishInvalidate: mocks.publishInvalidate,
}));

const PROJECT_ID = "55555555-5555-4555-8555-555555555555";
const RUN_ID = "44444444-4444-4444-8444-444444444444";
const CREATOR_ID = "22222222-2222-4222-8222-222222222222";
const VOIDED_MESSAGE = "测试任务已作废，不能修改";
const viewer = testUser({ role: "member", username: "bob" });

const run = {
	createdBy: CREATOR_ID,
	id: RUN_ID,
	projectId: PROJECT_ID,
	status: "in_progress",
} as TestRun;

interface Viewer {
	id: string;
	isMember: boolean;
	platformRole: UserRole;
}

function voidAs(
	{ id, isMember, platformRole }: Viewer,
	reason?: string | null
) {
	mocks.isProjectMember.mockResolvedValue(isMember);
	return call(
		testRunsRouter.void,
		{ reason, runId: RUN_ID },
		{
			context: callContext({ ...viewer, id, role: platformRole }),
			path: ["testRuns", "void"],
		}
	);
}

const memberViewer: Viewer = {
	id: viewer.id,
	isMember: true,
	platformRole: "member",
};

beforeEach(() => {
	vi.clearAllMocks();
	mocks.findTestRun.mockResolvedValue(run);
	mocks.voidTestRun.mockResolvedValue({ kind: "ok", run });
});

describe("testRuns.void：只有创建者和管理员可以作废", () => {
	it.each<[string, Viewer]>([
		["创建者（普通用户）", { ...memberViewer, id: CREATOR_ID }],
		[
			"管理员（不在项目里）",
			{ ...memberViewer, isMember: false, platformRole: "admin" },
		],
	])("%s：作废成功", async (_name, who) => {
		await expect(voidAs(who, "重复创建")).resolves.toEqual(run);
		expect(mocks.voidTestRun).toHaveBeenCalledWith({
			actorId: who.id,
			reason: "重复创建",
			runId: RUN_ID,
		});
		expect(mocks.publishInvalidate).toHaveBeenCalledTimes(1);
	});

	it("其他项目成员：FORBIDDEN，不写数据库", async () => {
		await expect(voidAs(memberViewer)).rejects.toMatchObject({
			code: "FORBIDDEN",
		});
		expect(mocks.voidTestRun).not.toHaveBeenCalled();
	});

	it("创建者的账号被删除后，项目成员也不能作废", async () => {
		mocks.findTestRun.mockResolvedValue({ ...run, createdBy: null });
		await expect(voidAs(memberViewer)).rejects.toMatchObject({
			code: "FORBIDDEN",
		});
	});

	it.each([
		[undefined, null],
		["   ", null],
		["  用例范围选错了  ", "用例范围选错了"],
	])("原因选填：%j 记为 %j", async (reason, recorded) => {
		await voidAs({ ...memberViewer, id: CREATOR_ID }, reason);
		expect(mocks.voidTestRun).toHaveBeenCalledWith(
			expect.objectContaining({ reason: recorded })
		);
	});

	it.each([
		[
			"已完成、已提交",
			{ kind: "invalid-status", status: "completed" },
			"CONFLICT",
			"已完成或已提交的测试任务不能作废",
		],
		[
			"已作废（终态）",
			{ kind: "voided", voidedAt: new Date() },
			"CONFLICT",
			VOIDED_MESSAGE,
		],
		["已不存在", { kind: "not-found" }, "NOT_FOUND", "测试任务不存在"],
	])("%s：拒绝作废", async (_name, result, code, message) => {
		mocks.voidTestRun.mockResolvedValue(result);
		await expect(
			voidAs({ ...memberViewer, id: CREATOR_ID })
		).rejects.toMatchObject({ code, message });
		expect(mocks.publishInvalidate).not.toHaveBeenCalled();
	});

	it("测试任务不存在：NOT_FOUND", async () => {
		mocks.findTestRun.mockResolvedValue(null);
		await expect(voidAs(memberViewer)).rejects.toMatchObject({
			code: "NOT_FOUND",
		});
	});
});

const byRunId = { runId: RUN_ID };
const callOptions = (name: string) => ({
	context: callContext(viewer),
	path: ["testRuns", name],
});

describe("已作废的测试任务拒绝所有写操作", () => {
	it.each([
		[
			"update",
			mocks.updateTestRun,
			() =>
				call(
					testRunsRouter.update,
					{ ...byRunId, name: "新名字" },
					callOptions("update")
				),
		],
		[
			"markReviewed",
			mocks.markTestRunReviewed,
			() =>
				call(testRunsRouter.markReviewed, byRunId, callOptions("markReviewed")),
		],
		[
			"unmarkReviewed",
			mocks.unmarkTestRunReviewed,
			() =>
				call(
					testRunsRouter.unmarkReviewed,
					byRunId,
					callOptions("unmarkReviewed")
				),
		],
		[
			"submit",
			mocks.submitTestRun,
			() => call(testRunsRouter.submit, byRunId, callOptions("submit")),
		],
	] as const)(
		"%s：CONFLICT「测试任务已作废，不能修改」",
		async (_name, repo, invoke) => {
			repo.mockResolvedValue({ kind: "voided", voidedAt: new Date() });
			mocks.isProjectMember.mockResolvedValue(true);
			await expect(invoke()).rejects.toMatchObject({
				code: "CONFLICT",
				message: VOIDED_MESSAGE,
			});
		}
	);
});

describe("testRuns.report：失败和阻塞用例的附件带下载地址", () => {
	const attachment = (storageKey: string, stepId: string | null) => ({
		fileName: `${storageKey}.png`,
		stepId,
		storageKey,
	});
	const failedOrBlockedCase = (
		result: "blocked" | "failed",
		attachments: ReturnType<typeof attachment>[]
	) => ({ attachments, result, steps: [] });

	const report = () =>
		call(testRunsRouter.report, byRunId, callOptions("report"));

	beforeEach(() => {
		mocks.isProjectMember.mockResolvedValue(true);
		mocks.getTestRunReport.mockResolvedValue({
			failedAndBlockedCases: [
				failedOrBlockedCase("failed", [attachment("actual", "s1")]),
				failedOrBlockedCase("blocked", [attachment("auto", null)]),
			],
			run,
		});
	});

	it.each([
		[
			"存储可用：每个附件一个签名地址",
			{
				presignDownload: (key: string) => Promise.resolve(`https://r2/${key}`),
			},
			["https://r2/actual", "https://r2/auto"],
		],
		["存储未配置：地址为 null", null, [null, null]],
	])("%s", async (_name, storage, urls) => {
		mocks.storage = storage;
		const { failedAndBlockedCases } = await report();
		expect(
			failedAndBlockedCases.map((item) => [
				item.result,
				item.attachments.map(({ attachment: { stepId }, url }) => [
					stepId,
					url,
				]),
			])
		).toEqual([
			["failed", [["s1", urls[0]]]],
			["blocked", [[null, urls[1]]]],
		]);
	});

	it("测试任务不存在：NOT_FOUND", async () => {
		mocks.getTestRunReport.mockResolvedValue(null);
		await expect(report()).rejects.toMatchObject({ code: "NOT_FOUND" });
	});
});

it("测试任务不能删除，只能作废：没有 remove 接口", () => {
	expect(testRunsRouter).not.toHaveProperty("remove");
	expect(testRunsRouter).toHaveProperty("void");
});

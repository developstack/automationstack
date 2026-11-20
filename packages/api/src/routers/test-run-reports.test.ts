import { call } from "@orpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { callContext, testUser } from "../test-fixtures";
import { testRunReportProcedures } from "./test-run-reports";

const mocks = vi.hoisted(() => ({
	isProjectMember: vi.fn(),
	listSubmittedReports: vi.fn(),
}));

vi.mock("@automationstack/db", () => ({ db: {} }));
vi.mock("@automationstack/db/repositories/project-members-repository", () => ({
	isProjectMember: mocks.isProjectMember,
}));
vi.mock(
	"@automationstack/db/repositories/test-run-report-list-repository",
	() => ({ listSubmittedReports: mocks.listSubmittedReports })
);

const PROJECT_ID = "55555555-5555-4555-8555-555555555555";
const viewer = testUser({ role: "member", username: "bob" });

beforeEach(() => {
	vi.clearAllMocks();
});

describe("testRuns.submittedReports：已提交的测试报告列表", () => {
	const SUBMITTER_ID = "33333333-3333-4333-8333-333333333333";

	function listReports(input: object) {
		mocks.isProjectMember.mockResolvedValue(true);
		return call(
			testRunReportProcedures.submittedReports,
			{ projectId: PROJECT_ID, ...input },
			{
				context: callContext(viewer),
				path: ["testRuns", "submittedReports"],
			}
		);
	}

	it("把项目 id 和筛选条件交给仓库", async () => {
		const page = { items: [], page: 2, pageSize: 20, submitters: [], total: 0 };
		mocks.listSubmittedReports.mockResolvedValue(page);
		const submittedFrom = new Date("2026-01-01T00:00:00Z");

		await expect(
			listReports({
				keyword: "冒烟",
				page: 2,
				submittedFrom,
				submitter: "system",
			})
		).resolves.toEqual(page);
		expect(mocks.listSubmittedReports).toHaveBeenCalledWith(PROJECT_ID, {
			keyword: "冒烟",
			page: 2,
			submittedFrom,
			submitter: "system",
		});
	});

	it("提交人可以是用户 id", async () => {
		mocks.listSubmittedReports.mockResolvedValue({});
		await listReports({ submitter: SUBMITTER_ID });
		expect(mocks.listSubmittedReports).toHaveBeenCalledWith(PROJECT_ID, {
			submitter: SUBMITTER_ID,
		});
	});

	it("提交人既不是 uuid 也不是 system：拒绝，不查数据库", async () => {
		await expect(listReports({ submitter: "alice" })).rejects.toMatchObject({
			code: "BAD_REQUEST",
		});
		expect(mocks.listSubmittedReports).not.toHaveBeenCalled();
	});
});

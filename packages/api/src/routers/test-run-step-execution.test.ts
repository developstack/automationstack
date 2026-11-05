import { call } from "@orpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { callContext, testUser } from "../test-fixtures";
import { testRunStepExecutionProcedures } from "./test-run-step-execution";

const mocks = vi.hoisted(() => ({
	publishInvalidate: vi.fn(),
	saveRunCaseStepResults: vi.fn(),
}));

vi.mock("@automationstack/db", () => ({ db: {} }));
vi.mock("@automationstack/db/repositories/project-members-repository", () => ({
	getProjectRole: () => Promise.resolve("member"),
}));
vi.mock("@automationstack/db/repositories/project-scope-repository", () => ({
	getProjectIdByRunCaseId: () => Promise.resolve(PROJECT_ID),
}));
vi.mock(
	"@automationstack/db/repositories/test-run-step-verdicts-repository",
	() => ({ saveRunCaseStepResults: mocks.saveRunCaseStepResults })
);
vi.mock("../lib/realtime-publish", () => ({
	publishInvalidate: mocks.publishInvalidate,
}));

const PROJECT_ID = "55555555-5555-4555-8555-555555555555";
const RUN_CASE_ID = "66666666-6666-4666-8666-666666666666";
const admin = testUser();

function saveSteps(
	steps: { actualResult: string | null; result: string; stepId: string }[]
) {
	return call(
		testRunStepExecutionProcedures.saveStepResults,
		{ caseVersion: 3, runCaseId: RUN_CASE_ID, steps } as never,
		{ context: callContext(admin), path: ["testRuns", "saveStepResults"] }
	);
}

beforeEach(() => {
	vi.clearAllMocks();
	mocks.saveRunCaseStepResults.mockResolvedValue({
		kind: "ok",
		run: { id: "run", projectId: PROJECT_ID },
		runCase: { id: RUN_CASE_ID },
	});
});

describe("testRuns.saveStepResults：每个步骤记录实际结果", () => {
	it("passes the actual result of every step, also of passed steps, to the repository", async () => {
		await saveSteps([
			{ actualResult: "登录页正常出现", result: "passed", stepId: "s1" },
			{ actualResult: "支付超时", result: "failed", stepId: "s2" },
			{ actualResult: null, result: "skipped", stepId: "s3" },
		]);
		expect(mocks.saveRunCaseStepResults).toHaveBeenCalledWith({
			actorId: admin.id,
			actualResults: { s1: "登录页正常出现", s2: "支付超时" },
			caseVersion: 3,
			judged: { s1: "passed", s2: "failed", s3: "skipped" },
			runCaseId: RUN_CASE_ID,
		});
		expect(mocks.publishInvalidate).toHaveBeenCalledTimes(1);
	});

	it.each([
		["actual-result-required", "步骤 2、3 判为失败或阻塞，必须填写实际结果"],
		["verdict-required", "步骤 2、3 没有判定，不能保存实际结果，请先选择判定"],
	])(
		"rejects the repository outcome %s and names the step numbers",
		async (kind, message) => {
			mocks.saveRunCaseStepResults.mockResolvedValue({
				kind,
				stepNumbers: [2, 3],
			});
			await expect(
				saveSteps([{ actualResult: null, result: "failed", stepId: "s2" }])
			).rejects.toMatchObject({ code: "BAD_REQUEST", message });
			expect(mocks.publishInvalidate).not.toHaveBeenCalled();
		}
	);

	it("rejects an actual result sent without a verdict before it reaches the repository", async () => {
		await expect(
			call(
				testRunStepExecutionProcedures.saveStepResults,
				{
					caseVersion: 3,
					runCaseId: RUN_CASE_ID,
					steps: [{ actualResult: "没测到这里", stepId: "s1" }],
				} as never,
				{ context: callContext(admin), path: ["testRuns", "saveStepResults"] }
			)
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
		expect(mocks.saveRunCaseStepResults).not.toHaveBeenCalled();
	});
});

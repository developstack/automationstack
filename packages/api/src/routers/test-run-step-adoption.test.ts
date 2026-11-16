import { call } from "@orpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { callContext, testUser } from "../test-fixtures";
import { testRunStepAdoptionProcedures } from "./test-run-step-adoption";

const mocks = vi.hoisted(() => ({
	adoptActualAsExpected: vi.fn(),
	findStepAdoptionSource: vi.fn(),
	publishInvalidate: vi.fn(),
	readObject: vi.fn(),
	remove: vi.fn(),
	writeObject: vi.fn(),
}));

vi.mock("@automationstack/db", () => ({ db: {} }));
vi.mock("@automationstack/db/repositories/project-members-repository", () => ({
	isProjectMember: () => Promise.resolve(true),
}));
vi.mock("@automationstack/db/repositories/project-scope-repository", () => ({
	getProjectIdByRunCaseId: () => Promise.resolve(PROJECT_ID),
}));
vi.mock(
	"@automationstack/db/repositories/test-run-step-adoption-repository",
	() => ({
		adoptActualAsExpected: mocks.adoptActualAsExpected,
		findStepAdoptionSource: mocks.findStepAdoptionSource,
	})
);
vi.mock("../lib/object-storage", () => ({
	getObjectStorage: () =>
		Promise.resolve({
			readObject: mocks.readObject,
			remove: mocks.remove,
			writeObject: mocks.writeObject,
		}),
}));
vi.mock("../lib/realtime-publish", () => ({
	publishInvalidate: mocks.publishInvalidate,
}));

const PROJECT_ID = "55555555-5555-4555-8555-555555555555";
const RUN_CASE_ID = "66666666-6666-4666-8666-666666666666";
const CASE_ID = "77777777-7777-4777-8777-777777777777";
const admin = testUser();

const SOURCE = {
	attachments: [
		{
			contentType: "image/png",
			fileName: "a.png",
			sizeBytes: 10,
			storageKey: "test-runs/a.png",
		},
		{
			contentType: "video/mp4",
			fileName: "v.mp4",
			sizeBytes: 10,
			storageKey: "test-runs/v.mp4",
		},
	],
	caseId: CASE_ID,
	projectId: PROJECT_ID,
};

const OK_RESULT = {
	kind: "ok",
	run: { id: "run-1", projectId: PROJECT_ID },
	runCase: { id: RUN_CASE_ID },
	stepNumber: 2,
	testCase: {
		currentVersion: 5,
		id: CASE_ID,
		moduleId: "module-1",
		projectId: PROJECT_ID,
	},
};

function adopt(context = callContext(admin)) {
	return call(
		testRunStepAdoptionProcedures.adoptActualAsExpected,
		{
			caseVersion: 3,
			runCaseId: RUN_CASE_ID,
			stepId: "s2",
			steps: [
				{ actualResult: "页面正常", result: "passed", stepId: "s1" },
				{ actualResult: "支付超时", result: "failed", stepId: "s2" },
				{ actualResult: null, result: "skipped", stepId: "s3" },
			],
		} as never,
		{ context, path: ["testRuns", "adoptActualAsExpected"] }
	);
}

beforeEach(() => {
	vi.clearAllMocks();
	mocks.findStepAdoptionSource.mockResolvedValue(SOURCE);
	mocks.adoptActualAsExpected.mockResolvedValue(OK_RESULT);
	mocks.readObject.mockResolvedValue(new Uint8Array(7));
	mocks.remove.mockResolvedValue(undefined);
	mocks.writeObject.mockResolvedValue(undefined);
});

describe("testRuns.adoptActualAsExpected：设为预期结果", () => {
	it("passes the verdicts and the copied images to the repository and publishes two invalidations", async () => {
		const result = await adopt();
		expect(mocks.findStepAdoptionSource).toHaveBeenCalledWith(
			RUN_CASE_ID,
			"s2"
		);
		expect(mocks.adoptActualAsExpected).toHaveBeenCalledWith({
			actorId: admin.id,
			actorName: "admin",
			actualResults: { s1: "页面正常", s2: "支付超时" },
			caseVersion: 3,
			images: [
				{
					contentType: "image/png",
					fileName: "a.png",
					sizeBytes: 7,
					storageKey: expect.stringMatching(
						new RegExp(`^test-cases/${PROJECT_ID}/${CASE_ID}/.+\\.png$`)
					),
				},
			],
			judged: { s1: "passed", s2: "failed", s3: "skipped" },
			runCaseId: RUN_CASE_ID,
			stepId: "s2",
		});
		expect(mocks.publishInvalidate).toHaveBeenCalledTimes(2);
		expect(mocks.publishInvalidate).toHaveBeenCalledWith(
			expect.objectContaining({ entity: "testRun", ids: ["run-1"] })
		);
		expect(mocks.publishInvalidate).toHaveBeenCalledWith(
			expect.objectContaining({ entity: "case", ids: [CASE_ID] })
		);
		expect(result).toMatchObject({
			caseVersion: 5,
			skippedAttachments: 1,
			stepNumber: 2,
		});
		expect(mocks.remove).not.toHaveBeenCalled();
	});

	it("records the name of the actor as the author of the case version", async () => {
		await adopt({
			...callContext(admin),
			actor: { clientId: "t", name: "Bot" },
		});
		expect(mocks.adoptActualAsExpected).toHaveBeenCalledWith(
			expect.objectContaining({ actorName: "Bot" })
		);
	});

	it("rejects with NOT_FOUND and copies nothing when the run case has no source", async () => {
		mocks.findStepAdoptionSource.mockResolvedValue(null);
		await expect(adopt()).rejects.toMatchObject({ code: "NOT_FOUND" });
		expect(mocks.writeObject).not.toHaveBeenCalled();
		expect(mocks.adoptActualAsExpected).not.toHaveBeenCalled();
		expect(mocks.publishInvalidate).not.toHaveBeenCalled();
	});

	it.each([
		[
			"no-actual-result",
			{ kind: "no-actual-result" },
			{
				code: "BAD_REQUEST",
				message: "这个步骤没有实际结果的文字或图片，不能设为预期结果",
			},
		],
		[
			"case-changed",
			{ currentVersion: 4, kind: "case-changed" },
			{ code: "CONFLICT", message: expect.stringContaining("v4") },
		],
	])(
		"rejects the outcome %s, removes the copied images and publishes nothing",
		async (_kind, outcome, expected) => {
			mocks.adoptActualAsExpected.mockResolvedValue(outcome);
			await expect(adopt()).rejects.toMatchObject(expected);
			expect(mocks.writeObject).toHaveBeenCalledTimes(1);
			expect(mocks.remove).toHaveBeenCalledTimes(1);
			expect(mocks.remove).toHaveBeenCalledWith(
				mocks.writeObject.mock.calls[0]?.[0]
			);
			expect(mocks.publishInvalidate).not.toHaveBeenCalled();
		}
	);
});

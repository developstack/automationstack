import { call } from "@orpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createStore, type FakeStore } from "../lib/object-store-fixtures";
import { callContext, testUser } from "../test-fixtures";
import { testRunAttachmentsRouter } from "./test-run-attachments";

const mocks = vi.hoisted(() => ({
	prepareAttachmentUpload: vi.fn(),
	presignUpload: vi.fn(),
	publishInvalidate: vi.fn(),
	registerStepAttachment: vi.fn(),
	removeAttachment: vi.fn(),
	store: null as FakeStore | null,
}));

vi.mock("@automationstack/db", () => ({ db: {} }));
vi.mock("@automationstack/env/server", () => ({ isR2Configured: () => true }));
vi.mock("@automationstack/db/repositories/project-members-repository", () => ({
	getProjectRole: () => Promise.resolve("member"),
}));
vi.mock("@automationstack/db/repositories/project-scope-repository", () => ({
	getProjectIdByRunAttachmentId: () => Promise.resolve(PROJECT_ID),
	getProjectIdByRunCaseId: () => Promise.resolve(PROJECT_ID),
}));
vi.mock(
	"@automationstack/db/repositories/test-run-attachments-repository",
	() => ({
		listAttachments: vi.fn(),
		prepareAttachmentUpload: mocks.prepareAttachmentUpload,
		registerStepAttachment: mocks.registerStepAttachment,
		removeAttachment: mocks.removeAttachment,
	})
);
vi.mock("../lib/object-storage", () => ({
	getObjectStorage: () => ({
		...mocks.store,
		presignUpload: mocks.presignUpload,
	}),
}));
vi.mock("../lib/realtime-publish", () => ({
	publishInvalidate: mocks.publishInvalidate,
}));

const PROJECT_ID = "55555555-5555-4555-8555-555555555555";
const RUN_ID = "77777777-7777-4777-8777-777777777777";
const RUN_CASE_ID = "66666666-6666-4666-8666-666666666666";
const ATTACHMENT_ID = "88888888-8888-4888-8888-888888888888";
const SCOPE = { projectId: PROJECT_ID, runCaseId: RUN_CASE_ID, runId: RUN_ID };
const STORAGE_KEY = `test-runs/${PROJECT_ID}/${RUN_ID}/${RUN_CASE_ID}/screenshot-1.png`;
const SUBMITTED_AT = new Date("2026-10-01T00:00:00Z");

const options = (name: string) => ({
	context: callContext(testUser()),
	path: ["testRunAttachments", name],
});

const presignInput = {
	contentType: "image/png",
	kind: "screenshot",
	runCaseId: RUN_CASE_ID,
	sizeBytes: 2048,
	stepId: "s2",
};

const presign = (overrides: Record<string, unknown> = {}) =>
	call(
		testRunAttachmentsRouter.presignUpload,
		{ ...presignInput, ...overrides } as never,
		options("presignUpload")
	);

const register = (overrides: Record<string, unknown> = {}) =>
	call(
		testRunAttachmentsRouter.register,
		{
			fileName: "超时.png",
			kind: "screenshot",
			runCaseId: RUN_CASE_ID,
			stepId: "s2",
			storageKey: STORAGE_KEY,
			...overrides,
		} as never,
		options("register")
	);

const remove = () =>
	call(
		testRunAttachmentsRouter.remove,
		{ attachmentId: ATTACHMENT_ID },
		options("remove")
	);

beforeEach(() => {
	vi.clearAllMocks();
	mocks.store = createStore();
	mocks.prepareAttachmentUpload.mockResolvedValue({ kind: "ok", scope: SCOPE });
	mocks.presignUpload.mockResolvedValue("https://r2.example.test/put");
	mocks.registerStepAttachment.mockResolvedValue({
		attachment: { id: ATTACHMENT_ID, stepId: "s2" },
		kind: "registered",
		scope: SCOPE,
	});
	mocks.removeAttachment.mockResolvedValue({
		attachment: { id: ATTACHMENT_ID, storageKey: STORAGE_KEY },
		kind: "removed",
		scope: SCOPE,
	});
});

describe("testRunAttachments：每个步骤的实际附件", () => {
	it.each([
		["a screenshot", { contentType: "image/png", kind: "screenshot" }, 2048],
		[
			"a video of exactly 20 MB",
			{ contentType: "video/mp4", kind: "video" },
			20 * 1024 * 1024,
		],
	])(
		"presigns an upload of %s for one step that accepts only the declared type and size",
		async (_name, overrides, sizeBytes) => {
			const result = await presign({ ...overrides, sizeBytes });
			expect(mocks.prepareAttachmentUpload).toHaveBeenCalledWith(
				RUN_CASE_ID,
				"s2"
			);
			expect(result.storageKey.startsWith(`test-runs/${PROJECT_ID}/`)).toBe(
				true
			);
			expect(mocks.presignUpload).toHaveBeenCalledWith(result.storageKey, {
				contentLength: sizeBytes,
				contentType: overrides.contentType,
			});
		}
	);

	it.each([
		["an upload without a step (the whole case)", { stepId: undefined }],
		["a log file", { contentType: "text/plain", kind: "log" }],
		["a GIF image", { contentType: "image/gif" }],
		["a file larger than 20 MB", { sizeBytes: 20 * 1024 * 1024 + 1 }],
	])("rejects %s before it signs an upload", async (_name, overrides) => {
		await expect(presign(overrides)).rejects.toMatchObject({
			code: "BAD_REQUEST",
		});
		expect(mocks.presignUpload).not.toHaveBeenCalled();
	});

	it.each([
		[{ kind: "unknown-step" }, "BAD_REQUEST", "这个步骤不属于该用例"],
		[
			{ kind: "step-attachment-limit", max: 9 },
			"BAD_REQUEST",
			"一个步骤最多 9 个实际附件",
		],
		[{ kind: "locked", submittedAt: SUBMITTED_AT }, "CONFLICT", "提交并锁定"],
		[{ kind: "voided", voidedAt: SUBMITTED_AT }, "CONFLICT", "已作废"],
	])(
		"maps the rejection %j of presign to %s",
		async (rejection, code, text) => {
			mocks.prepareAttachmentUpload.mockResolvedValue(rejection);
			const error = await presign().catch((caught: unknown) => caught);
			expect(error).toMatchObject({ code });
			expect(String((error as Error).message)).toContain(text);
			expect(mocks.presignUpload).not.toHaveBeenCalled();
		}
	);

	it("registers the uploaded file on the step and notifies other viewers", async () => {
		await register();
		expect(mocks.registerStepAttachment).toHaveBeenCalledWith(
			expect.objectContaining({
				contentType: "image/png",
				runCaseId: RUN_CASE_ID,
				stepId: "s2",
				storageKey: STORAGE_KEY,
			})
		);
		expect(mocks.publishInvalidate).toHaveBeenCalledWith(
			expect.objectContaining({ entity: "testRun", ids: [RUN_ID] })
		);
	});

	it.each([
		[{ kind: "unknown-step" }, "BAD_REQUEST"],
		[{ kind: "step-attachment-limit", max: 9 }, "BAD_REQUEST"],
		[{ kind: "locked", submittedAt: SUBMITTED_AT }, "CONFLICT"],
	])(
		"keeps the stored object, which can belong to a registered attachment, when register is rejected with %j",
		async (rejection, code) => {
			mocks.registerStepAttachment.mockResolvedValue(rejection);
			await expect(register()).rejects.toMatchObject({ code });
			expect(mocks.store?.calls).toEqual([`headObject:${STORAGE_KEY}`]);
			expect(mocks.publishInvalidate).not.toHaveBeenCalled();
		}
	);

	it("rejects a register without a step", async () => {
		await expect(register({ stepId: undefined })).rejects.toMatchObject({
			code: "BAD_REQUEST",
		});
		expect(mocks.registerStepAttachment).not.toHaveBeenCalled();
	});

	it("removes an actual attachment from storage and notifies other viewers", async () => {
		await expect(remove()).resolves.toEqual({ id: ATTACHMENT_ID });
		expect(mocks.store?.calls).toContain(`remove:${STORAGE_KEY}`);
		expect(mocks.publishInvalidate).toHaveBeenCalledTimes(1);
	});

	it.each([
		[{ kind: "read-only" }, "BAD_REQUEST"],
		[{ kind: "voided", voidedAt: SUBMITTED_AT }, "CONFLICT"],
	])(
		"keeps the file when remove is rejected with %j",
		async (rejection, code) => {
			mocks.removeAttachment.mockResolvedValue(rejection);
			await expect(remove()).rejects.toMatchObject({ code });
			expect(mocks.store?.calls).toEqual([]);
		}
	);
});

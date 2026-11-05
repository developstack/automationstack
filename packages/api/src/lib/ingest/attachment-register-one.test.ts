import { beforeEach, expect, test, vi } from "vitest";
import type { ObjectStorage } from "../object-storage";
import { createStore } from "../object-store-fixtures";
import { registerOne } from "./attachment-register-one";

const mocks = vi.hoisted(() => ({
	registerAttachment: vi.fn(),
	registerStepAttachment: vi.fn(),
}));

vi.mock("@automationstack/db", () => ({ db: {} }));
vi.mock(
	"@automationstack/db/repositories/test-run-attachments-repository",
	() => mocks
);

const SCOPE = { projectId: "p", runCaseId: "rc", runId: "r" };
const STORAGE_KEY = "test-runs/p/r/rc/log-1.txt";
const ITEM = {
	fileName: "run.log",
	index: 3,
	kind: "log" as const,
	runCaseId: "rc",
	runId: "r",
	storageKey: STORAGE_KEY,
};

beforeEach(() => {
	vi.clearAllMocks();
	mocks.registerAttachment.mockResolvedValue({
		attachment: { id: "a1" },
		kind: "registered",
		scope: SCOPE,
	});
});

// 自动化上传的附件仍然挂在整条用例上（ADR 0005）：不带步骤，也不受实际附件的数量和格式限制
test("an automation upload registers on the whole case, with the same receipt as before", async () => {
	const storage = createStore({
		contentLength: 2048,
		contentType: "text/plain",
	}) as unknown as ObjectStorage;
	const result = await registerOne({
		item: ITEM,
		scope: SCOPE,
		storage,
		userId: "u1",
	});
	expect(mocks.registerStepAttachment).not.toHaveBeenCalled();
	const [input] = mocks.registerAttachment.mock.calls[0] ?? [];
	expect(input).not.toHaveProperty("stepId");
	expect(input).toMatchObject({
		contentType: "text/plain",
		createdBy: "u1",
		fileName: "run.log",
		kind: "log",
		runCaseId: "rc",
		sizeBytes: 2048,
		storageKey: STORAGE_KEY,
		uploadedVia: "automation",
	});
	expect(result).toEqual({
		attachment: {
			attachmentId: "a1",
			index: 3,
			runCaseId: "rc",
			storageKey: STORAGE_KEY,
		},
		kind: "registered",
		runId: "r",
	});
});

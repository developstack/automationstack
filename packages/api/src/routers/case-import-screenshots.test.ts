import { call } from "@orpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { signScreenshotUploadToken } from "../lib/case-screenshot-upload-token";
import { createStore, VALID_HEAD } from "../lib/object-store-fixtures";
import { callContext, testUser } from "../test-fixtures";
import { caseImportProcedures } from "./case-import";

const SECRET = "test-session-secret-0123456789abcdef";

const mocks = vi.hoisted(() => ({
	getProjectRole: vi.fn(),
	importTestCases: vi.fn(),
	storage: null as unknown,
}));

vi.mock("@automationstack/db", () => ({ db: {} }));
vi.mock("@automationstack/env/server", () => ({
	env: { SESSION_SECRET: "test-session-secret-0123456789abcdef" },
}));
vi.mock("@automationstack/db/repositories/case-import-repository", () => ({
	IMPORT_BATCH_LIMIT: 50,
	importTestCases: mocks.importTestCases,
}));
vi.mock("@automationstack/db/repositories/case-search-repository", () => ({
	SEARCH_MAX_LIMIT: 50,
	searchTestCases: vi.fn(),
}));
vi.mock("@automationstack/db/repositories/project-members-repository", () => ({
	getProjectRole: mocks.getProjectRole,
}));
vi.mock("../lib/object-storage", () => ({
	getObjectStorage: () => mocks.storage,
}));
vi.mock("../lib/realtime-publish", () => ({ publishInvalidate: vi.fn() }));

const PROJECT_ID = "55555555-5555-4555-8555-555555555555";
const MODULE_ID = "77777777-7777-4777-8777-777777777777";
const CASE_ID = "44444444-4444-4444-8444-444444444444";
const ATTACHMENT_ID = "00000000-0000-4000-8000-0000000000a1";
const STORAGE_KEY = `test-cases/${PROJECT_ID}/${CASE_ID}/a.png`;
const user = testUser();

const caseRow = (name: string, actionScreenshots?: string[]) => ({
	moduleId: MODULE_ID,
	name,
	sourceRef: `xmind:${name}`,
	steps: [{ actionScreenshots, expected: "", id: "s1", step: "打开" }],
});

function importBatch(cases: unknown[]) {
	return call(
		caseImportProcedures.importBatch,
		{ cases, onDuplicate: "overwrite", projectId: PROJECT_ID },
		{ context: callContext(user), path: ["cases", "importBatch"] }
	);
}

beforeEach(() => {
	vi.clearAllMocks();
	mocks.storage = createStore();
	mocks.importTestCases.mockResolvedValue({
		created: [],
		errors: [],
		skipped: [],
	});
});

describe("cases.importBatch：步骤可以引用截图上传", () => {
	it("passes the attachments of the uploads with the row and reports a bad row without blocking the others", async () => {
		const token = await signScreenshotUploadToken(
			{
				attachmentId: ATTACHMENT_ID,
				caseId: CASE_ID,
				contentType: VALID_HEAD.contentType,
				fileName: "a.png",
				projectId: PROJECT_ID,
				sizeBytes: VALID_HEAD.contentLength,
				storageKey: STORAGE_KEY,
				userId: user.id,
			},
			{ now: Date.now(), secret: SECRET }
		);
		const result = await importBatch([
			caseRow("坏的", ["not-a-token"]),
			caseRow("登录", [token]),
			caseRow("退出"),
		]);
		expect(mocks.importTestCases).toHaveBeenCalledWith(
			expect.objectContaining({
				rows: [
					{
						index: 1,
						item: expect.objectContaining({
							steps: [
								{
									actionScreenshots: [ATTACHMENT_ID],
									expected: "",
									id: "s1",
									step: "打开",
								},
							],
						}),
						screenshots: {
							attachments: [
								{
									contentType: VALID_HEAD.contentType,
									createdBy: user.id,
									fileName: "a.png",
									id: ATTACHMENT_ID,
									sizeBytes: VALID_HEAD.contentLength,
									storageKey: STORAGE_KEY,
								},
							],
							caseId: CASE_ID,
						},
					},
					{ index: 2, item: expect.objectContaining({ name: "退出" }) },
				],
			})
		);
		expect(result.errors).toEqual([
			{
				index: 0,
				message:
					"步骤 s1 的操作截图：截图上传凭证无效，请使用取得上传地址时返回的 uploadToken",
				name: "坏的",
				sourceRef: "xmind:坏的",
			},
		]);
	});
});

import { call } from "@orpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { buildCaseAttachmentStorageKey } from "../lib/case-attachment-policy";
import { callContext, testUser } from "../test-fixtures";
import { caseAttachmentDraftProcedures } from "./case-attachment-drafts";

const mocks = vi.hoisted(() => ({
	presignUpload: vi.fn(),
	projectExists: vi.fn(),
	storage: null as unknown,
}));

vi.mock("@automationstack/db", () => ({ db: {} }));
vi.mock("@automationstack/env/server", () => ({ env: {} }));
vi.mock("@automationstack/db/repositories/projects-repository", () => ({
	projectExists: mocks.projectExists,
}));
vi.mock("@automationstack/db/repositories/project-members-repository", () => ({
	getProjectRole: vi.fn(),
}));
vi.mock("../lib/object-storage", () => ({
	getObjectStorage: () => mocks.storage,
}));

const PROJECT_ID = "55555555-5555-4555-8555-555555555555";
const CASE_ID = "44444444-4444-4444-8444-444444444444";
const scope = { caseId: CASE_ID, projectId: PROJECT_ID };

beforeEach(() => {
	vi.clearAllMocks();
	mocks.storage = null;
	mocks.projectExists.mockResolvedValue(true);
	mocks.presignUpload.mockResolvedValue("https://r2.example.test/put");
});

function presignUpload(sizeBytes: number) {
	mocks.storage = { presignUpload: mocks.presignUpload };
	return call(
		caseAttachmentDraftProcedures.presignDraftUpload,
		{ ...scope, contentType: "image/png", fileName: "a.png", sizeBytes },
		{
			context: callContext(testUser()),
			path: ["caseAttachments", "presignDraftUpload"],
		}
	);
}

function presignDownload(storageKeys: string[]) {
	return call(
		caseAttachmentDraftProcedures.presignDraftDownload,
		{ ...scope, storageKeys },
		{
			context: callContext(testUser()),
			path: ["caseAttachments", "presignDraftDownload"],
		}
	);
}

describe("caseAttachments.presignDraftDownload：恢复新用例草稿中的图片", () => {
	it("signs as many images as one new case can save (200)", async () => {
		const storageKeys = Array.from({ length: 200 }, () =>
			buildCaseAttachmentStorageKey(scope, { contentType: "image/png" })
		);
		mocks.storage = {
			caseImageUrl: (storageKey: string) =>
				Promise.resolve(`https://files.example.test/${storageKey}`),
		};
		const urls = await presignDownload(storageKeys);
		expect(urls).toHaveLength(200);
		expect(urls[0]?.url).toBe(`https://files.example.test/${storageKeys[0]}`);
	});

	it("rejects a storage key of another case", async () => {
		await expect(
			presignDownload([`test-cases/${PROJECT_ID}/other/1.png`])
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
	});
});

describe("caseAttachments.presignDraftUpload：为新用例草稿中的一张图片取得上传地址", () => {
	it("signs an upload URL that accepts only the declared type and size", async () => {
		const result = await presignUpload(2048);
		expect(result.storageKey).toMatch(`test-cases/${PROJECT_ID}/${CASE_ID}/`);
		expect(mocks.presignUpload).toHaveBeenCalledWith(result.storageKey, {
			contentLength: 2048,
			contentType: "image/png",
		});
	});

	it("rejects a file larger than 10 MB before it signs a URL", async () => {
		await expect(presignUpload(10 * 1024 * 1024 + 1)).rejects.toMatchObject({
			code: "BAD_REQUEST",
			message: "图片 10485761 字节，超过上限 10485760 字节",
		});
		expect(mocks.presignUpload).not.toHaveBeenCalled();
	});
});

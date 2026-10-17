import { call } from "@orpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { readScreenshotUploadToken } from "../lib/case-screenshot-upload-token";
import { callContext, testUser } from "../test-fixtures";
import { caseScreenshotUploadProcedures } from "./case-screenshot-uploads";

const SECRET = "test-session-secret-0123456789abcdef";

const mocks = vi.hoisted(() => ({
	getProjectIdByCaseId: vi.fn(),
	getProjectRole: vi.fn(),
	prepareCaseAttachmentUpload: vi.fn(),
	presignUpload: vi.fn(),
}));

vi.mock("@automationstack/db", () => ({ db: {} }));
vi.mock("@automationstack/env/server", () => ({
	env: { SESSION_SECRET: "test-session-secret-0123456789abcdef" },
}));
vi.mock("@automationstack/db/repositories/case-attachments-repository", () => ({
	prepareCaseAttachmentUpload: mocks.prepareCaseAttachmentUpload,
}));
vi.mock("@automationstack/db/repositories/project-members-repository", () => ({
	getProjectRole: mocks.getProjectRole,
}));
vi.mock("@automationstack/db/repositories/project-scope-repository", () => ({
	getProjectIdByCaseId: mocks.getProjectIdByCaseId,
}));
vi.mock("../lib/r2", () => ({
	getR2Storage: () => ({ presignUpload: mocks.presignUpload }),
}));

const PROJECT_ID = "55555555-5555-4555-8555-555555555555";
const CASE_ID = "44444444-4444-4444-8444-444444444444";
const UPLOAD_URL = "https://r2.example.test/put?signature=1";

const input = {
	caseId: CASE_ID,
	contentType: "image/png",
	fileName: "登录页.png",
	sizeBytes: 2048,
};

function presign(overrides: Partial<typeof input> = {}, user = testUser()) {
	return call(
		caseScreenshotUploadProcedures.presignColumnScreenshotUpload,
		{ ...input, ...overrides },
		{
			context: callContext(user),
			path: ["caseAttachments", "presignColumnScreenshotUpload"],
		}
	);
}

beforeEach(() => {
	vi.clearAllMocks();
	mocks.getProjectIdByCaseId.mockResolvedValue(PROJECT_ID);
	mocks.getProjectRole.mockResolvedValue(null);
	mocks.prepareCaseAttachmentUpload.mockResolvedValue({
		kind: "ok",
		scope: { caseId: CASE_ID, projectId: PROJECT_ID },
	});
	mocks.presignUpload.mockResolvedValue(UPLOAD_URL);
});

describe("caseAttachments.presignColumnScreenshotUpload：为一个用例的一张截图取得上传地址", () => {
	it("returns a 5-minute upload URL and a token for this case and this user only", async () => {
		const user = testUser();
		const result = await presign({}, user);
		expect(result).toMatchObject({
			contentType: "image/png",
			expiresInSeconds: 300,
			tokenExpiresInSeconds: 3600,
			uploadUrl: UPLOAD_URL,
		});
		const [storageKey, contentType] = mocks.presignUpload.mock.calls[0] ?? [];
		expect(contentType).toBe("image/png");
		expect(storageKey).toMatch(`test-cases/${PROJECT_ID}/${CASE_ID}/`);
		expect(
			await readScreenshotUploadToken(result.uploadToken, {
				now: Date.now(),
				secret: SECRET,
			})
		).toEqual({
			kind: "ok",
			upload: {
				attachmentId: expect.any(String),
				caseId: CASE_ID,
				fileName: "登录页.png",
				projectId: PROJECT_ID,
				storageKey,
				userId: user.id,
			},
		});
	});

	it.each<[string, Partial<typeof input>, string, string]>([
		[
			"a file larger than 10 MB",
			{ sizeBytes: 10 * 1024 * 1024 + 1 },
			"BAD_REQUEST",
			"图片 10485761 字节，超过上限 10485760 字节",
		],
		[
			"a type that is not allowed",
			{ contentType: "image/gif" },
			"BAD_REQUEST",
			"用例贴图不支持 image/gif，允许的类型：image/png, image/jpeg, image/webp",
		],
	])(
		"rejects %s before it signs a URL",
		async (_name, overrides, code, message) => {
			await expect(presign(overrides)).rejects.toMatchObject({ code, message });
			expect(mocks.presignUpload).not.toHaveBeenCalled();
		}
	);

	it("rejects a user who cannot write the case", async () => {
		await expect(
			presign({}, testUser({ role: "member", username: "bob" }))
		).rejects.toMatchObject({ code: "FORBIDDEN" });
		expect(mocks.presignUpload).not.toHaveBeenCalled();
	});
});

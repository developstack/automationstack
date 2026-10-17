import { call } from "@orpc/server";
import { describe, expect, it, vi } from "vitest";

import { buildCaseAttachmentStorageKey } from "../lib/case-attachment-policy";
import { callContext, testUser } from "../test-fixtures";
import { caseAttachmentDraftProcedures } from "./case-attachment-drafts";

vi.mock("@automationstack/db", () => ({ db: {} }));
vi.mock("@automationstack/env/server", () => ({ env: {} }));
vi.mock("@automationstack/db/repositories/projects-repository", () => ({
	projectExists: vi.fn(),
}));
vi.mock("@automationstack/db/repositories/project-members-repository", () => ({
	getProjectRole: vi.fn(),
}));
vi.mock("../lib/r2", () => ({ getR2Storage: () => null }));

const PROJECT_ID = "55555555-5555-4555-8555-555555555555";
const CASE_ID = "44444444-4444-4444-8444-444444444444";
const scope = { caseId: CASE_ID, projectId: PROJECT_ID };

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
		const urls = await presignDownload(storageKeys);
		expect(urls).toHaveLength(200);
	});

	it("rejects a storage key of another case", async () => {
		await expect(
			presignDownload([`test-cases/${PROJECT_ID}/other/1.png`])
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
	});
});

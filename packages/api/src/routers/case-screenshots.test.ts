import { call } from "@orpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { callContext, testUser } from "../test-fixtures";
import { casesRouter } from "./cases";

const mocks = vi.hoisted(() => ({
	createTestCase: vi.fn(),
	findCaseAttachmentIds: vi.fn(),
	getProjectIdByCaseId: vi.fn(),
	getProjectRole: vi.fn(),
	updateTestCase: vi.fn(),
}));

vi.mock("@automationstack/db", () => ({ db: {} }));
vi.mock("@automationstack/env/server", () => ({ env: {} }));
vi.mock("@automationstack/db/repositories/case-mutations-repository", () => ({
	createTestCase: mocks.createTestCase,
	updateTestCase: mocks.updateTestCase,
}));
vi.mock("@automationstack/db/repositories/case-attachments-repository", () => ({
	findCaseAttachmentIds: mocks.findCaseAttachmentIds,
}));
vi.mock("@automationstack/db/repositories/project-members-repository", () => ({
	getProjectRole: mocks.getProjectRole,
}));
vi.mock("@automationstack/db/repositories/project-scope-repository", () => ({
	getProjectIdByCaseId: mocks.getProjectIdByCaseId,
}));
vi.mock("../lib/r2", () => ({ getR2Storage: () => null }));
vi.mock("../lib/realtime-publish", () => ({ publishInvalidate: vi.fn() }));
vi.mock("../lib/case-attachment-draft-ingest", () => ({
	resolveNewCaseAttachments: vi.fn().mockResolvedValue([]),
}));

const PROJECT_ID = "55555555-5555-4555-8555-555555555555";
const MODULE_ID = "77777777-7777-4777-8777-777777777777";
const CASE_ID = "44444444-4444-4444-8444-444444444444";
const OWNED = "00000000-0000-4000-8000-000000000001";
const FOREIGN = "00000000-0000-4000-8000-000000000002";
const context = callContext(testUser());

const step = (expectedScreenshots: string[]) => ({
	actionScreenshots: [OWNED],
	expected: "",
	expectedScreenshots,
	id: "s1",
	step: "",
});

beforeEach(() => {
	vi.clearAllMocks();
	mocks.getProjectIdByCaseId.mockResolvedValue(PROJECT_ID);
	mocks.findCaseAttachmentIds.mockImplementation((_caseId, ids: string[]) =>
		Promise.resolve(new Set(ids.filter((id) => id === OWNED)))
	);
	mocks.updateTestCase.mockResolvedValue({ kind: "unchanged", testCase: {} });
});

function update(expectedScreenshots: string[]) {
	return call(
		casesRouter.update,
		{
			expectedVersion: 1,
			id: CASE_ID,
			patch: { steps: [step(expectedScreenshots)] },
		},
		{ context, path: ["cases", "update"] }
	);
}

describe("cases.update：操作截图和预期截图只能引用这个用例的附件", () => {
	it("saves screenshots that belong to the case", async () => {
		await update([OWNED]);
		expect(mocks.findCaseAttachmentIds).toHaveBeenCalledWith(CASE_ID, [OWNED]);
		expect(mocks.updateTestCase).toHaveBeenCalledOnce();
	});

	it("rejects a screenshot of another case and saves nothing", async () => {
		await expect(update([FOREIGN])).rejects.toMatchObject({
			code: "BAD_REQUEST",
			message: "操作截图或预期截图引用了不属于这个用例的附件",
		});
		expect(mocks.updateTestCase).not.toHaveBeenCalled();
	});
});

const newAttachment = (n: number) => ({
	fileName: `${n}.png`,
	id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
	storageKey: `k${n}`,
});

function create(
	attachments: ReturnType<typeof newAttachment>[],
	steps = [step([])]
) {
	return call(
		casesRouter.create,
		{
			attachments,
			id: CASE_ID,
			moduleId: MODULE_ID,
			name: "登录",
			projectId: PROJECT_ID,
			steps,
		},
		{ context, path: ["cases", "create"] }
	);
}

describe("cases.create：截图只能引用一起提交的新附件", () => {
	it("rejects a screenshot that is not in the new attachments", async () => {
		await expect(
			create([newAttachment(1)], [step([FOREIGN])])
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
		expect(mocks.createTestCase).not.toHaveBeenCalled();
	});

	it("rejects more than 200 new attachments with a message that says the limit", async () => {
		const attachments = Array.from({ length: 201 }, (_, n) => newAttachment(n));
		await expect(create(attachments)).rejects.toMatchObject({
			code: "BAD_REQUEST",
			message:
				"新用例一次最多保存 200 张图片，这次有 201 张。请减少图片后再保存",
		});
		expect(mocks.createTestCase).not.toHaveBeenCalled();
	});
});

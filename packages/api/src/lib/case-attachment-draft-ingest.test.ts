import { describe, expect, it } from "vitest";

import {
	type DraftCaseAttachmentErrors,
	resolveNewCaseAttachments,
	verifyDraftCaseAttachments,
} from "./case-attachment-draft-ingest";
import type { CaseAttachmentKeyScope } from "./case-attachment-policy";
import { createStore } from "./object-store-fixtures";

const SCOPE: CaseAttachmentKeyScope = {
	caseId: "22222222-2222-4222-8222-222222222222",
	projectId: "11111111-1111-4111-8111-111111111111",
};

const ownedKey = (name: string): string =>
	`test-cases/${SCOPE.projectId}/${SCOPE.caseId}/${name}.png`;

const FOREIGN_KEY = `test-cases/${SCOPE.projectId}/33333333-3333-4333-8333-333333333333/abc.png`;

const errors: DraftCaseAttachmentErrors = {
	BAD_REQUEST: (options) => new Error(options?.message ?? "BAD_REQUEST"),
};

const entry = (id: string, storageKey = ownedKey("one")) => ({
	fileName: `${id}.png`,
	id,
	storageKey,
});

describe("verifyDraftCaseAttachments", () => {
	it("落库值取自 HeadObject，而不是调用方给的任何声明", async () => {
		const storage = createStore({
			contentLength: 4096,
			contentType: "image/webp",
		});
		const rows = await verifyDraftCaseAttachments(
			{
				createdBy: "user-1",
				entries: [{ ...entry("a"), fileName: "pasted-image.png" }],
				scope: SCOPE,
				storage,
			},
			errors
		);
		expect(rows).toEqual([
			{
				contentType: "image/webp",
				createdBy: "user-1",
				fileName: "pasted-image.png",
				id: "a",
				sizeBytes: 4096,
				storageKey: ownedKey("one"),
			},
		]);
	});

	it.each([
		{
			calls: [],
			entries: [entry("a"), entry("b", FOREIGN_KEY)],
			head: undefined,
			message: "storageKey 不属于该用例",
			name: "整批里混进一个越界 key 时全批拒绝，且一次都不碰对象存储",
		},
		{
			calls: [],
			entries: [entry("same"), entry("same", ownedKey("two"))],
			head: undefined,
			message: "重复的 id 或 storageKey",
			name: "批内重复的 id 直接拒绝，不留给 onConflictDoNothing 静默吞掉",
		},
		{
			calls: [`headObject:${ownedKey("one")}`],
			entries: [entry("a")],
			head: null,
			message: "对象不存在",
			name: "对象不存在时报错，不允许登记一张永远加载不出来的死图",
		},
	])("$name", async ({ calls, entries, head, message }) => {
		const storage = createStore(head);
		await expect(
			verifyDraftCaseAttachments(
				{ createdBy: null, entries, scope: SCOPE, storage },
				errors
			)
		).rejects.toThrow(message);
		expect(storage.calls).toEqual(calls);
	});
});

describe("resolveNewCaseAttachments", () => {
	it("没传 attachments 时返回空数组，且完全不需要存储", async () => {
		await expect(
			resolveNewCaseAttachments(
				{ createdBy: "user-1", projectId: SCOPE.projectId, storage: null },
				errors
			)
		).resolves.toEqual([]);
	});

	it("传了 attachments 却没传 id 是非法组合", () => {
		expect(() =>
			resolveNewCaseAttachments(
				{
					attachments: [entry("a")],
					createdBy: "user-1",
					projectId: SCOPE.projectId,
					storage: createStore(),
				},
				errors
			)
		).toThrow("必须提供预生成的 id");
	});

	it("按传入的 id 拼前缀：换个 id 就够不着原来那条用例的对象", async () => {
		const storage = createStore();
		await expect(
			resolveNewCaseAttachments(
				{
					attachments: [entry("a")],
					createdBy: "user-1",
					id: "44444444-4444-4444-8444-444444444444",
					projectId: SCOPE.projectId,
					storage,
				},
				errors
			)
		).rejects.toThrow("storageKey 不属于该用例");
		expect(storage.calls).toEqual([]);
	});
});

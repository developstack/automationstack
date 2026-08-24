import { describe, expect, it } from "vitest";

import type {
	AttachmentObjectHead,
	AttachmentObjectStore,
} from "./attachment-ingest";
import {
	type DraftCaseAttachmentErrors,
	resolveNewCaseAttachments,
	verifyDraftCaseAttachments,
} from "./case-attachment-draft-ingest";
import type { CaseAttachmentKeyScope } from "./case-attachment-policy";

/**
 * 与 `case-attachment-ingest.test.ts` 同一种取向：测的是**编排**，不是判定。
 *
 * 草稿态没有数据库行可以兜底，`isCaseAttachmentKeyOwnedBy` 是这条链路上唯一的
 * 归属判据，所以下面每一条都显式断言「越界的 key 出现时，对象存储被碰过几次」。
 * 这类性质最典型的死法是有人为了少一次遍历把预检那个循环删掉——那时单条的
 * `verifyUploadedCaseImage` 仍然会拒绝越界 key，功能测试照样绿，
 * 但「整批要么全过要么一个对象都不碰」这条保证已经没了。
 */

const SCOPE: CaseAttachmentKeyScope = {
	caseId: "22222222-2222-4222-8222-222222222222",
	projectId: "11111111-1111-4111-8111-111111111111",
};

const ownedKey = (name: string): string =>
	`test-cases/${SCOPE.projectId}/${SCOPE.caseId}/${name}.png`;

/** 另一条用例下的 key——形状完全合法，只是不属于调用者。 */
const FOREIGN_KEY = `test-cases/${SCOPE.projectId}/33333333-3333-4333-8333-333333333333/abc.png`;

const VALID_HEAD: AttachmentObjectHead = {
	contentLength: 2048,
	contentType: "image/png",
};

const errors: DraftCaseAttachmentErrors = {
	BAD_REQUEST: (options) => new Error(options?.message ?? "BAD_REQUEST"),
};

interface FakeStore extends AttachmentObjectStore {
	/** 按发生顺序记录的调用，用来断言先后关系而不只是次数。 */
	calls: string[];
}

function createStore(
	head: AttachmentObjectHead | null = VALID_HEAD
): FakeStore {
	const calls: string[] = [];
	return {
		calls,
		headObject: (storageKey) => {
			calls.push(`headObject:${storageKey}`);
			return Promise.resolve(head);
		},
		remove: (storageKey) => {
			calls.push(`remove:${storageKey}`);
			return Promise.resolve();
		},
	};
}

describe("verifyDraftCaseAttachments", () => {
	it("落库值取自 HeadObject，而不是调用方给的任何声明", async () => {
		const storage = createStore({
			contentLength: 4096,
			contentType: "image/webp",
		});

		const rows = await verifyDraftCaseAttachments(
			{
				createdBy: "user-1",
				entries: [
					{
						fileName: "pasted-image.png",
						id: "a",
						storageKey: ownedKey("one"),
					},
				],
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

	it("整批里混进一个越界 key 时全批拒绝，且一次都不碰对象存储", async () => {
		const storage = createStore();

		await expect(
			verifyDraftCaseAttachments(
				{
					createdBy: null,
					entries: [
						{ fileName: "a.png", id: "a", storageKey: ownedKey("one") },
						{ fileName: "b.png", id: "b", storageKey: FOREIGN_KEY },
					],
					scope: SCOPE,
					storage,
				},
				errors
			)
		).rejects.toThrow("storageKey 不属于该用例");

		// 最关键的一条：合法的那个 key 也不能被 Head——否则这条接口就成了
		// 「这个对象存不存在」的探测器，而且越界 key 只要混在一批里就能拿到
		// 其余 key 的存在性信息。
		expect(storage.calls).toEqual([]);
	});

	it("批内重复的 id 直接拒绝，不留给 onConflictDoNothing 静默吞掉", async () => {
		const storage = createStore();

		await expect(
			verifyDraftCaseAttachments(
				{
					createdBy: null,
					entries: [
						{ fileName: "a.png", id: "same", storageKey: ownedKey("one") },
						{ fileName: "b.png", id: "same", storageKey: ownedKey("two") },
					],
					scope: SCOPE,
					storage,
				},
				errors
			)
		).rejects.toThrow("重复的 id 或 storageKey");
		expect(storage.calls).toEqual([]);
	});

	it("对象不存在时报错，不允许登记一张永远加载不出来的死图", async () => {
		const storage = createStore(null);

		await expect(
			verifyDraftCaseAttachments(
				{
					createdBy: null,
					entries: [
						{ fileName: "a.png", id: "a", storageKey: ownedKey("one") },
					],
					scope: SCOPE,
					storage,
				},
				errors
			)
		).rejects.toThrow("对象不存在");
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
					attachments: [
						{ fileName: "a.png", id: "a", storageKey: ownedKey("one") },
					],
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
					attachments: [
						{ fileName: "a.png", id: "a", storageKey: ownedKey("one") },
					],
					createdBy: "user-1",
					// 与 storageKey 里的 caseId 不同：伪造 key 想偷别人的图就是这个形状。
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

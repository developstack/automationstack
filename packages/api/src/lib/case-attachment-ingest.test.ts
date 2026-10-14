import { expect, it } from "vitest";

import {
	type CaseAttachmentErrorThrowers,
	verifyUploadedCaseImage,
} from "./case-attachment-ingest";
import {
	type CaseAttachmentKeyScope,
	MAX_CASE_IMAGE_BYTES,
} from "./case-attachment-policy";
import { createStore, VALID_HEAD } from "./object-store-fixtures";

const SCOPE: CaseAttachmentKeyScope = {
	caseId: "22222222-2222-4222-8222-222222222222",
	projectId: "11111111-1111-4111-8111-111111111111",
};

const OWNED_KEY = `test-cases/${SCOPE.projectId}/${SCOPE.caseId}/abc.png`;

const FOREIGN_KEY = `test-cases/${SCOPE.projectId}/33333333-3333-4333-8333-333333333333/abc.png`;

const HEAD_ONLY = [`headObject:${OWNED_KEY}`];
const HEAD_THEN_REMOVE = [...HEAD_ONLY, `remove:${OWNED_KEY}`];

const errors: CaseAttachmentErrorThrowers = {
	BAD_REQUEST: (options) => new Error(options?.message ?? "BAD_REQUEST"),
	NOT_FOUND: (options) => new Error(options?.message ?? "NOT_FOUND"),
};

it.each([
	{
		calls: [],
		head: VALID_HEAD,
		message: "storageKey 不属于该用例",
		name: "拒绝不属于该用例的 key，且一次都不碰对象",
		storageKey: FOREIGN_KEY,
	},
	{
		calls: [],
		head: VALID_HEAD,
		message: "storageKey 不属于该用例",
		name: "拒绝测试任务附件的 key，且一次都不碰对象",
		storageKey: `test-runs/${SCOPE.projectId}/r/rc/screenshot-x.png`,
	},
	{
		calls: HEAD_ONLY,
		head: null,
		message: "对象不存在",
		name: "对象不存在时拒绝，且不调用 remove",
		storageKey: OWNED_KEY,
	},
	{
		calls: HEAD_THEN_REMOVE,
		head: { contentLength: MAX_CASE_IMAGE_BYTES + 1, contentType: "image/png" },
		message: "实际上传的图片",
		name: "存储里的真实体积超限时，先删对象再抛",
		storageKey: OWNED_KEY,
	},
	{
		calls: HEAD_THEN_REMOVE,
		head: { contentLength: 1024, contentType: "video/mp4" },
		message: "用例贴图不支持实际上传的 video/mp4",
		name: "声明 png 实际传 mp4：签名管不住，HeadObject 能——先删对象再抛",
		storageKey: OWNED_KEY,
	},
])(
	"verifyUploadedCaseImage：$name",
	async ({ calls, head, message, storageKey }) => {
		const storage = createStore(head);
		await expect(
			verifyUploadedCaseImage({ scope: SCOPE, storage, storageKey }, errors)
		).rejects.toThrow(message);
		expect(storage.calls).toEqual(calls);
	}
);

it("verifyUploadedCaseImage：校验通过时返回 HeadObject 的真值，且不删对象", async () => {
	const storage = createStore(VALID_HEAD);
	const verified = await verifyUploadedCaseImage(
		{ scope: SCOPE, storage, storageKey: OWNED_KEY },
		errors
	);
	expect(verified).toEqual({ contentType: "image/png", sizeBytes: 1024 });
	expect(storage.calls).toEqual(HEAD_ONLY);
});

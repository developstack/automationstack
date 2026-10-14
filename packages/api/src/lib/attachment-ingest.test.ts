import { expect, it } from "vitest";

import { verifyUploadedObject } from "./attachment-ingest";
import {
	type AttachmentKeyScope,
	MAX_ATTACHMENT_BYTES,
} from "./attachment-policy";
import { createStore, VALID_HEAD } from "./object-store-fixtures";
import type { TestRunErrorThrowers } from "./test-run-errors";

const SCOPE: AttachmentKeyScope = {
	projectId: "11111111-1111-4111-8111-111111111111",
	runCaseId: "33333333-3333-4333-8333-333333333333",
	runId: "22222222-2222-4222-8222-222222222222",
};

const OWNED_KEY = `test-runs/${SCOPE.projectId}/${SCOPE.runId}/${SCOPE.runCaseId}/screenshot-abc.png`;

const FOREIGN_KEY = `test-runs/${SCOPE.projectId}/${SCOPE.runId}/44444444-4444-4444-8444-444444444444/screenshot-abc.png`;

const HEAD_ONLY = [`headObject:${OWNED_KEY}`];
const HEAD_THEN_REMOVE = [...HEAD_ONLY, `remove:${OWNED_KEY}`];

const errors: TestRunErrorThrowers = {
	BAD_REQUEST: (options) => new Error(options?.message ?? "BAD_REQUEST"),
	CONFLICT: (options) => new Error(options?.message ?? "CONFLICT"),
	NOT_FOUND: (options) => new Error(options?.message ?? "NOT_FOUND"),
};

it.each([
	{
		calls: [],
		head: VALID_HEAD,
		message: "storageKey 不属于该用例行",
		name: "拒绝不属于该用例行的 key，且一次都不碰对象",
		storageKey: FOREIGN_KEY,
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
		head: { contentLength: MAX_ATTACHMENT_BYTES + 1, contentType: "image/png" },
		message: "实际上传的附件",
		name: "存储里的真实体积超限时，先删对象再抛",
		storageKey: OWNED_KEY,
	},
	{
		calls: HEAD_THEN_REMOVE,
		head: { contentLength: 1024, contentType: "video/mp4" },
		message: "screenshot 不支持实际上传的 video/mp4",
		name: "存储里的真实类型不在该 kind 白名单时，先删对象再抛",
		storageKey: OWNED_KEY,
	},
])(
	"verifyUploadedObject：$name",
	async ({ calls, head, message, storageKey }) => {
		const storage = createStore(head);
		await expect(
			verifyUploadedObject(
				{ kind: "screenshot", scope: SCOPE, storage, storageKey },
				errors
			)
		).rejects.toThrow(message);
		expect(storage.calls).toEqual(calls);
	}
);

it("verifyUploadedObject：校验通过时返回 HeadObject 的真值，且不删对象", async () => {
	const storage = createStore(VALID_HEAD);
	const verified = await verifyUploadedObject(
		{ kind: "screenshot", scope: SCOPE, storage, storageKey: OWNED_KEY },
		errors
	);
	expect(verified).toEqual({ contentType: "image/png", sizeBytes: 1024 });
	expect(storage.calls).toEqual(HEAD_ONLY);
});

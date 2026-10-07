import { describe, expect, it } from "vitest";

import {
	type AttachmentObjectHead,
	type AttachmentObjectStore,
	verifyUploadedObject,
} from "./attachment-ingest";
import {
	type AttachmentKeyScope,
	MAX_ATTACHMENT_BYTES,
} from "./attachment-policy";
import type { TestRunErrorThrowers } from "./test-run-errors";

const SCOPE: AttachmentKeyScope = {
	projectId: "11111111-1111-4111-8111-111111111111",
	runCaseId: "33333333-3333-4333-8333-333333333333",
	runId: "22222222-2222-4222-8222-222222222222",
};

const OWNED_KEY = `test-runs/${SCOPE.projectId}/${SCOPE.runId}/${SCOPE.runCaseId}/screenshot-abc.png`;

const FOREIGN_KEY = `test-runs/${SCOPE.projectId}/${SCOPE.runId}/44444444-4444-4444-8444-444444444444/screenshot-abc.png`;

const VALID_HEAD: AttachmentObjectHead = {
	contentLength: 1024,
	contentType: "image/png",
};

const errors: TestRunErrorThrowers = {
	BAD_REQUEST: (options) => new Error(options?.message ?? "BAD_REQUEST"),
	CONFLICT: (options) => new Error(options?.message ?? "CONFLICT"),
	NOT_FOUND: (options) => new Error(options?.message ?? "NOT_FOUND"),
};

interface FakeStore extends AttachmentObjectStore {
	calls: string[];
}

function createStore(head: AttachmentObjectHead | null): FakeStore {
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

describe("verifyUploadedObject", () => {
	it("拒绝不属于该用例行的 key，且一次都不碰对象", async () => {
		const storage = createStore(VALID_HEAD);

		await expect(
			verifyUploadedObject(
				{ kind: "screenshot", scope: SCOPE, storage, storageKey: FOREIGN_KEY },
				errors
			)
		).rejects.toThrow("storageKey 不属于该用例行");

		expect(storage.calls).toEqual([]);
	});

	it("对象不存在时拒绝，且不调用 remove", async () => {
		const storage = createStore(null);

		await expect(
			verifyUploadedObject(
				{ kind: "screenshot", scope: SCOPE, storage, storageKey: OWNED_KEY },
				errors
			)
		).rejects.toThrow("对象不存在");

		expect(storage.calls).toEqual([`headObject:${OWNED_KEY}`]);
	});

	it("存储里的真实体积超限时，先删对象再抛", async () => {
		const storage = createStore({
			contentLength: MAX_ATTACHMENT_BYTES + 1,
			contentType: "image/png",
		});

		await expect(
			verifyUploadedObject(
				{ kind: "screenshot", scope: SCOPE, storage, storageKey: OWNED_KEY },
				errors
			)
		).rejects.toThrow("实际上传的附件");

		expect(storage.calls).toEqual([
			`headObject:${OWNED_KEY}`,
			`remove:${OWNED_KEY}`,
		]);
	});

	it("存储里的真实类型不在该 kind 白名单时，先删对象再抛", async () => {
		const storage = createStore({
			contentLength: 1024,
			contentType: "video/mp4",
		});

		await expect(
			verifyUploadedObject(
				{ kind: "screenshot", scope: SCOPE, storage, storageKey: OWNED_KEY },
				errors
			)
		).rejects.toThrow("screenshot 不支持实际上传的 video/mp4");

		expect(storage.calls).toEqual([
			`headObject:${OWNED_KEY}`,
			`remove:${OWNED_KEY}`,
		]);
	});

	it("校验通过时返回 HeadObject 的真值，且不删对象", async () => {
		const storage = createStore(VALID_HEAD);

		const verified = await verifyUploadedObject(
			{ kind: "screenshot", scope: SCOPE, storage, storageKey: OWNED_KEY },
			errors
		);

		expect(verified).toEqual({ contentType: "image/png", sizeBytes: 1024 });
		expect(storage.calls).toEqual([`headObject:${OWNED_KEY}`]);
	});
});

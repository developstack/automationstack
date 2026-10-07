import { describe, expect, it } from "vitest";

import type {
	AttachmentObjectHead,
	AttachmentObjectStore,
} from "./attachment-ingest";
import {
	type CaseAttachmentErrorThrowers,
	verifyUploadedCaseImage,
} from "./case-attachment-ingest";
import {
	type CaseAttachmentKeyScope,
	MAX_CASE_IMAGE_BYTES,
} from "./case-attachment-policy";

const SCOPE: CaseAttachmentKeyScope = {
	caseId: "22222222-2222-4222-8222-222222222222",
	projectId: "11111111-1111-4111-8111-111111111111",
};

const OWNED_KEY = `test-cases/${SCOPE.projectId}/${SCOPE.caseId}/abc.png`;

const FOREIGN_KEY = `test-cases/${SCOPE.projectId}/33333333-3333-4333-8333-333333333333/abc.png`;

const VALID_HEAD: AttachmentObjectHead = {
	contentLength: 1024,
	contentType: "image/png",
};

const errors: CaseAttachmentErrorThrowers = {
	BAD_REQUEST: (options) => new Error(options?.message ?? "BAD_REQUEST"),
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

describe("verifyUploadedCaseImage", () => {
	it("拒绝不属于该用例的 key，且一次都不碰对象", async () => {
		const storage = createStore(VALID_HEAD);

		await expect(
			verifyUploadedCaseImage(
				{ scope: SCOPE, storage, storageKey: FOREIGN_KEY },
				errors
			)
		).rejects.toThrow("storageKey 不属于该用例");

		expect(storage.calls).toEqual([]);
	});

	it("拒绝测试任务附件的 key，且一次都不碰对象", async () => {
		const storage = createStore(VALID_HEAD);
		const runKey = `test-runs/${SCOPE.projectId}/r/rc/screenshot-x.png`;

		await expect(
			verifyUploadedCaseImage(
				{ scope: SCOPE, storage, storageKey: runKey },
				errors
			)
		).rejects.toThrow("storageKey 不属于该用例");

		expect(storage.calls).toEqual([]);
	});

	it("对象不存在时拒绝，且不调用 remove", async () => {
		const storage = createStore(null);

		await expect(
			verifyUploadedCaseImage(
				{ scope: SCOPE, storage, storageKey: OWNED_KEY },
				errors
			)
		).rejects.toThrow("对象不存在");

		expect(storage.calls).toEqual([`headObject:${OWNED_KEY}`]);
	});

	it("存储里的真实体积超限时，先删对象再抛", async () => {
		const storage = createStore({
			contentLength: MAX_CASE_IMAGE_BYTES + 1,
			contentType: "image/png",
		});

		await expect(
			verifyUploadedCaseImage(
				{ scope: SCOPE, storage, storageKey: OWNED_KEY },
				errors
			)
		).rejects.toThrow("实际上传的图片");

		expect(storage.calls).toEqual([
			`headObject:${OWNED_KEY}`,
			`remove:${OWNED_KEY}`,
		]);
	});

	it("声明 png 实际传 mp4：签名管不住，HeadObject 能——先删对象再抛", async () => {
		const storage = createStore({
			contentLength: 1024,
			contentType: "video/mp4",
		});

		await expect(
			verifyUploadedCaseImage(
				{ scope: SCOPE, storage, storageKey: OWNED_KEY },
				errors
			)
		).rejects.toThrow("用例贴图不支持实际上传的 video/mp4");

		expect(storage.calls).toEqual([
			`headObject:${OWNED_KEY}`,
			`remove:${OWNED_KEY}`,
		]);
	});

	it("校验通过时返回 HeadObject 的真值，且不删对象", async () => {
		const storage = createStore(VALID_HEAD);

		const verified = await verifyUploadedCaseImage(
			{ scope: SCOPE, storage, storageKey: OWNED_KEY },
			errors
		);

		expect(verified).toEqual({ contentType: "image/png", sizeBytes: 1024 });
		expect(storage.calls).toEqual([`headObject:${OWNED_KEY}`]);
	});
});

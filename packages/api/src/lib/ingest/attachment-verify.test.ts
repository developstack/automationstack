import { expect, test, vi } from "vitest";

import type { AttachmentObjectStore } from "../attachment-ingest";
import { MAX_ATTACHMENT_BYTES } from "../attachment-policy";
import {
	RUN_CASE_ONE,
	RUN_CASE_TWO,
	RUN_ONE,
	RUN_TWO,
} from "./attachment-fixtures";
import { verifyAutomationAttachment } from "./attachment-reconcile";

function fakeStore(
	head: { contentLength: number; contentType: string } | null
): AttachmentObjectStore {
	return {
		headObject: vi.fn().mockResolvedValue(head),
		remove: vi.fn().mockResolvedValue(undefined),
	};
}

const SCOPE = {
	projectId: "eeeeeeee-1111-4111-8111-111111111111",
	runCaseId: RUN_CASE_ONE,
	runId: RUN_ONE,
};
const OWNED_KEY = `test-runs/${SCOPE.projectId}/${RUN_ONE}/${RUN_CASE_ONE}/screenshot-x.png`;

test("归属校验先于任何碰对象的操作：key 不属于该用例行时连 HeadObject 都不发", async () => {
	const store = fakeStore({ contentLength: 1024, contentType: "image/png" });
	const result = await verifyAutomationAttachment({
		kind: "screenshot",
		scope: SCOPE,
		storageKey: `test-runs/${SCOPE.projectId}/${RUN_TWO}/${RUN_CASE_TWO}/screenshot-x.png`,
		store,
	});
	expect(result).toEqual({
		kind: "rejected",
		reason: "storageKey 不属于该用例行",
	});
	expect(store.headObject).not.toHaveBeenCalled();
	expect(store.remove).not.toHaveBeenCalled();
});

test("对象不存在即拒绝，堵住「presign 完没传就登记」的幽灵行", async () => {
	const store = fakeStore(null);
	const result = await verifyAutomationAttachment({
		kind: "screenshot",
		scope: SCOPE,
		storageKey: OWNED_KEY,
		store,
	});
	expect(result).toEqual({
		kind: "rejected",
		reason: "对象不存在，请重新上传后再登记",
	});
	expect(store.remove).not.toHaveBeenCalled();
});

test("实际对象违规时先删对象再拒绝，不在 bucket 里留垃圾", async () => {
	const store = fakeStore({
		contentLength: MAX_ATTACHMENT_BYTES + 1,
		contentType: "image/png",
	});
	const result = await verifyAutomationAttachment({
		kind: "screenshot",
		scope: SCOPE,
		storageKey: OWNED_KEY,
		store,
	});
	expect(result.kind).toBe("rejected");
	expect(store.remove).toHaveBeenCalledWith(OWNED_KEY);
});

test("落库用的是 HeadObject 读回的真值", async () => {
	const store = fakeStore({ contentLength: 4096, contentType: "image/webp" });
	const result = await verifyAutomationAttachment({
		kind: "screenshot",
		scope: SCOPE,
		storageKey: OWNED_KEY,
		store,
	});
	expect(result).toEqual({
		contentType: "image/webp",
		kind: "ok",
		sizeBytes: 4096,
	});
	expect(store.remove).not.toHaveBeenCalled();
});

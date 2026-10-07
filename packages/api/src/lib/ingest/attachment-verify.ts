import type { TestRunAttachmentKind } from "@automationstack/db/schema/test-runs";

import type { AttachmentObjectStore } from "../attachment-ingest";
import {
	type AttachmentKeyScope,
	isAttachmentKeyOwnedBy,
	validateAttachmentUpload,
} from "../attachment-policy";

export interface VerifyAutomationAttachmentInput {
	kind: TestRunAttachmentKind;
	scope: AttachmentKeyScope;
	storageKey: string;
	store: AttachmentObjectStore;
}

export type VerifyAutomationAttachmentResult =
	| { contentType: string; kind: "ok"; sizeBytes: number }
	| { kind: "rejected"; reason: string };

export async function verifyAutomationAttachment(
	input: VerifyAutomationAttachmentInput
): Promise<VerifyAutomationAttachmentResult> {
	if (!isAttachmentKeyOwnedBy(input.storageKey, input.scope)) {
		return { kind: "rejected", reason: "storageKey 不属于该用例行" };
	}
	const head = await input.store.headObject(input.storageKey);
	if (head === null) {
		return { kind: "rejected", reason: "对象不存在，请重新上传后再登记" };
	}
	const validation = validateAttachmentUpload({
		contentType: head.contentType,
		kind: input.kind,
		sizeBytes: head.contentLength,
	});
	if (validation.kind === "ok") {
		return {
			contentType: head.contentType,
			kind: "ok",
			sizeBytes: head.contentLength,
		};
	}
	await input.store.remove(input.storageKey);
	if (validation.kind === "too-large") {
		return {
			kind: "rejected",
			reason: `实际上传的附件 ${head.contentLength} 字节，超过单文件上限 ${validation.maxBytes} 字节`,
		};
	}
	return {
		kind: "rejected",
		reason: `${input.kind} 不支持实际上传的 ${head.contentType}，允许的类型：${validation.allowedContentTypes.join(", ")}`,
	};
}

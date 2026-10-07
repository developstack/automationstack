import type { TestRunAttachmentKind } from "@automationstack/db/schema/test-runs";

import {
	type AttachmentKeyScope,
	type AttachmentUploadValidation,
	isAttachmentKeyOwnedBy,
	validateAttachmentUpload,
} from "./attachment-policy";
import type { TestRunErrorThrowers } from "./test-run-errors";

export interface AttachmentObjectHead {
	contentLength: number;
	contentType: string;
}

export interface AttachmentObjectStore {
	headObject: (storageKey: string) => Promise<AttachmentObjectHead | null>;
	remove: (storageKey: string) => Promise<void>;
}

export interface VerifiedAttachmentObject {
	contentType: string;
	sizeBytes: number;
}

export function throwAttachmentViolation(
	violation: Exclude<AttachmentUploadValidation, { kind: "ok" }>,
	subject: {
		contentType: string;
		kind: TestRunAttachmentKind;
		sizeBytes: number;
	},
	errors: TestRunErrorThrowers,
	source: "declared" | "stored"
): never {
	const prefix = source === "stored" ? "实际上传的" : "";
	if (violation.kind === "too-large") {
		throw errors.BAD_REQUEST({
			message: `${prefix}附件 ${subject.sizeBytes} 字节，超过上限 ${violation.maxBytes} 字节`,
		});
	}
	throw errors.BAD_REQUEST({
		message: `${subject.kind} 不支持${prefix} ${subject.contentType}，允许的类型：${violation.allowedContentTypes.join(", ")}`,
	});
}

export async function verifyUploadedObject(
	target: {
		kind: TestRunAttachmentKind;
		scope: AttachmentKeyScope;
		storage: AttachmentObjectStore;
		storageKey: string;
	},
	errors: TestRunErrorThrowers
): Promise<VerifiedAttachmentObject> {
	if (!isAttachmentKeyOwnedBy(target.storageKey, target.scope)) {
		throw errors.BAD_REQUEST({ message: "storageKey 不属于该用例行" });
	}
	const head = await target.storage.headObject(target.storageKey);
	if (head === null) {
		throw errors.BAD_REQUEST({ message: "对象不存在，请重新上传后再登记" });
	}
	const verified: VerifiedAttachmentObject = {
		contentType: head.contentType,
		sizeBytes: head.contentLength,
	};
	const validation = validateAttachmentUpload({
		contentType: verified.contentType,
		kind: target.kind,
		sizeBytes: verified.sizeBytes,
	});
	if (validation.kind !== "ok") {
		await target.storage.remove(target.storageKey);
		throwAttachmentViolation(
			validation,
			{ ...verified, kind: target.kind },
			errors,
			"stored"
		);
	}
	return verified;
}

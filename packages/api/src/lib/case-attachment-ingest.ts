import type {
	AttachmentObjectHead,
	AttachmentObjectStore,
} from "./attachment-ingest";
import {
	type CaseAttachmentKeyScope,
	type CaseImageUploadValidation,
	isCaseAttachmentKeyOwnedBy,
	validateCaseImageUpload,
} from "./case-attachment-policy";

export interface VerifiedCaseImage {
	contentType: string;
	sizeBytes: number;
}

export interface CaseAttachmentErrorThrowers {
	BAD_REQUEST: (options?: { message?: string }) => Error;
	NOT_FOUND: (options?: { message?: string }) => Error;
}

export function throwCaseImageViolation(
	violation: Exclude<CaseImageUploadValidation, { kind: "ok" }>,
	subject: VerifiedCaseImage,
	errors: CaseAttachmentErrorThrowers,
	source: "declared" | "stored"
): never {
	const prefix = source === "stored" ? "实际上传的" : "";
	if (violation.kind === "too-large") {
		throw errors.BAD_REQUEST({
			message: `${prefix}图片 ${subject.sizeBytes} 字节，超过上限 ${violation.maxBytes} 字节`,
		});
	}
	throw errors.BAD_REQUEST({
		message: `用例贴图不支持${prefix} ${subject.contentType}，允许的类型：${violation.allowedContentTypes.join(", ")}`,
	});
}

const MISSING_OBJECT_MESSAGE = "对象不存在，请重新上传后再登记";

export async function verifyUploadedCaseImage(
	target: {
		/** 对象不存在时的错误信息。不同的调用方告诉用户不同的下一步。 */
		missingMessage?: string;
		scope: CaseAttachmentKeyScope;
		storage: AttachmentObjectStore;
		storageKey: string;
	},
	errors: CaseAttachmentErrorThrowers
): Promise<VerifiedCaseImage> {
	if (!isCaseAttachmentKeyOwnedBy(target.storageKey, target.scope)) {
		throw errors.BAD_REQUEST({ message: "storageKey 不属于该用例" });
	}
	const head: AttachmentObjectHead | null = await target.storage.headObject(
		target.storageKey
	);
	if (head === null) {
		throw errors.BAD_REQUEST({
			message: target.missingMessage ?? MISSING_OBJECT_MESSAGE,
		});
	}
	const verified: VerifiedCaseImage = {
		contentType: head.contentType,
		sizeBytes: head.contentLength,
	};
	const validation = validateCaseImageUpload(verified);
	if (validation.kind !== "ok") {
		await target.storage.remove(target.storageKey);
		throwCaseImageViolation(validation, verified, errors, "stored");
	}
	return verified;
}

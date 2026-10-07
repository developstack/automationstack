import { randomUUID } from "node:crypto";

const BYTES_PER_MIB = 1024 * 1024;

const MAX_CASE_IMAGE_MIB = 10;

export const MAX_CASE_IMAGE_BYTES = MAX_CASE_IMAGE_MIB * BYTES_PER_MIB;

export const CASE_IMAGE_CONTENT_TYPES = [
	"image/png",
	"image/jpeg",
	"image/webp",
] as const;

const EXTENSION_BY_CONTENT_TYPE: Record<string, string> = {
	"image/jpeg": "jpg",
	"image/png": "png",
	"image/webp": "webp",
};

const FALLBACK_EXTENSION = "bin";

const CASE_ATTACHMENT_KEY_ROOT = "test-cases";

export interface CaseAttachmentKeyScope {
	caseId: string;
	projectId: string;
}

export interface CaseImageUploadRequest {
	contentType: string;
	sizeBytes: number;
}

export type CaseImageUploadValidation =
	| { kind: "ok" }
	| { allowedContentTypes: readonly string[]; kind: "unsupported-content-type" }
	| { kind: "too-large"; maxBytes: number };

export function validateCaseImageUpload(
	request: CaseImageUploadRequest
): CaseImageUploadValidation {
	if (
		!(CASE_IMAGE_CONTENT_TYPES as readonly string[]).includes(
			request.contentType
		)
	) {
		return {
			allowedContentTypes: CASE_IMAGE_CONTENT_TYPES,
			kind: "unsupported-content-type",
		};
	}
	if (request.sizeBytes > MAX_CASE_IMAGE_BYTES) {
		return { kind: "too-large", maxBytes: MAX_CASE_IMAGE_BYTES };
	}
	return { kind: "ok" };
}

export function caseAttachmentKeyPrefix(scope: CaseAttachmentKeyScope): string {
	return `${CASE_ATTACHMENT_KEY_ROOT}/${scope.projectId}/${scope.caseId}/`;
}

export function isCaseAttachmentKeyOwnedBy(
	storageKey: string,
	scope: CaseAttachmentKeyScope
): boolean {
	if (storageKey.split("/").includes("..")) {
		return false;
	}
	return storageKey.startsWith(caseAttachmentKeyPrefix(scope));
}

export function buildCaseAttachmentStorageKey(
	scope: CaseAttachmentKeyScope,
	image: { contentType: string }
): string {
	const extension =
		EXTENSION_BY_CONTENT_TYPE[image.contentType] ?? FALLBACK_EXTENSION;
	return `${caseAttachmentKeyPrefix(scope)}${randomUUID()}.${extension}`;
}

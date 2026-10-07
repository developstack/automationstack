import { randomUUID } from "node:crypto";
import type { TestRunAttachmentKind } from "@automationstack/db/schema/test-runs";

const BYTES_PER_MIB = 1024 * 1024;

const MAX_ATTACHMENT_MIB = 20;

export const MAX_ATTACHMENT_BYTES = MAX_ATTACHMENT_MIB * BYTES_PER_MIB;

export const UPLOAD_URL_TTL_SECONDS = 5 * 60;

export const DOWNLOAD_URL_TTL_SECONDS = 15 * 60;

const IMAGE_CONTENT_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
const VIDEO_CONTENT_TYPES = ["video/mp4", "video/webm"] as const;
const LOG_CONTENT_TYPES = ["text/plain"] as const;

const ALLOWED_CONTENT_TYPES_BY_KIND: Record<
	TestRunAttachmentKind,
	readonly string[]
> = {
	log: LOG_CONTENT_TYPES,
	other: [...IMAGE_CONTENT_TYPES, ...VIDEO_CONTENT_TYPES, ...LOG_CONTENT_TYPES],
	screenshot: IMAGE_CONTENT_TYPES,
	video: VIDEO_CONTENT_TYPES,
};

const EXTENSION_BY_CONTENT_TYPE: Record<string, string> = {
	"image/jpeg": "jpg",
	"image/png": "png",
	"image/webp": "webp",
	"text/plain": "txt",
	"video/mp4": "mp4",
	"video/webm": "webm",
};

const FALLBACK_EXTENSION = "bin";

const ATTACHMENT_KEY_ROOT = "test-runs";

export interface AttachmentUploadRequest {
	contentType: string;
	kind: TestRunAttachmentKind;
	sizeBytes: number;
}

export type AttachmentUploadValidation =
	| { kind: "ok" }
	| { allowedContentTypes: readonly string[]; kind: "unsupported-content-type" }
	| { kind: "too-large"; maxBytes: number };

export function validateAttachmentUpload(
	request: AttachmentUploadRequest
): AttachmentUploadValidation {
	const allowedContentTypes = ALLOWED_CONTENT_TYPES_BY_KIND[request.kind];
	if (!allowedContentTypes.includes(request.contentType)) {
		return { allowedContentTypes, kind: "unsupported-content-type" };
	}
	if (request.sizeBytes > MAX_ATTACHMENT_BYTES) {
		return { kind: "too-large", maxBytes: MAX_ATTACHMENT_BYTES };
	}
	return { kind: "ok" };
}

export interface AttachmentKeyScope {
	projectId: string;
	runCaseId: string;
	runId: string;
}

export function attachmentKeyPrefix(scope: AttachmentKeyScope): string {
	return `${ATTACHMENT_KEY_ROOT}/${scope.projectId}/${scope.runId}/${scope.runCaseId}/`;
}

export function isAttachmentKeyOwnedBy(
	storageKey: string,
	scope: AttachmentKeyScope
): boolean {
	if (storageKey.split("/").includes("..")) {
		return false;
	}
	return storageKey.startsWith(attachmentKeyPrefix(scope));
}

export function buildAttachmentStorageKey(
	scope: AttachmentKeyScope,
	attachment: { contentType: string; kind: TestRunAttachmentKind }
): string {
	const extension =
		EXTENSION_BY_CONTENT_TYPE[attachment.contentType] ?? FALLBACK_EXTENSION;
	return `${attachmentKeyPrefix(scope)}${attachment.kind}-${randomUUID()}.${extension}`;
}

import { z } from "zod";

import { MAX_INGEST_SOURCE_REF_LENGTH } from "./execution-contract";

const attachmentKindSchema = z.enum(["screenshot", "video", "log", "other"]);

export const MAX_INGEST_ATTACHMENTS_PER_REQUEST = 2000;

export const MAX_AUTOMATION_ATTACHMENTS_PER_RUN = 500;

const BYTES_PER_GIB = 1024 * 1024 * 1024;

export const MAX_AUTOMATION_ATTACHMENT_BYTES_PER_RUN = BYTES_PER_GIB;

const sizeBytesSchema = z.int().positive();

export const ingestAttachmentPresignItemSchema = z.object({
	contentType: z.string().min(1),
	kind: attachmentKindSchema,
	sizeBytes: sizeBytesSchema,
	sourceRef: z
		.string()
		.min(1)
		.max(
			MAX_INGEST_SOURCE_REF_LENGTH,
			`sourceRef 最长 ${MAX_INGEST_SOURCE_REF_LENGTH} 字符`
		),
});

export const ingestAttachmentPresignRequestSchema = z.object({
	attachments: z
		.array(ingestAttachmentPresignItemSchema)
		.max(
			MAX_INGEST_ATTACHMENTS_PER_REQUEST,
			`一次最多申请 ${MAX_INGEST_ATTACHMENTS_PER_REQUEST} 个附件的签名；请分批`
		),
	projectId: z.uuid(),
	runIds: z.array(z.uuid()).nullable().default(null),
});

export const MAX_INGEST_STORAGE_KEY_LENGTH = 255;

export const ingestAttachmentRegisterItemSchema = z.object({
	fileName: z.string().min(1).max(255),
	kind: attachmentKindSchema,
	runCaseId: z.uuid(),
	runId: z.uuid(),
	storageKey: z
		.string()
		.min(1)
		.max(
			MAX_INGEST_STORAGE_KEY_LENGTH,
			`storageKey 最长 ${MAX_INGEST_STORAGE_KEY_LENGTH} 字符；请原样回传 presign 返回的那一条，不要自己拼`
		),
});

export const ingestAttachmentRegisterRequestSchema = z.object({
	attachments: z
		.array(ingestAttachmentRegisterItemSchema)
		.max(
			MAX_INGEST_ATTACHMENTS_PER_REQUEST,
			`一次最多登记 ${MAX_INGEST_ATTACHMENTS_PER_REQUEST} 个附件；请分批`
		),
});

export const ingestAttachmentUploadSchema = z.object({
	contentType: z.string(),
	index: z.int().nonnegative(),
	runCaseId: z.uuid(),
	runId: z.uuid(),
	runName: z.string(),
	sourceRef: z.string(),
	storageKey: z.string(),
	uploadUrl: z.url(),
});

export const ingestAttachmentRejectionSchema = z.object({
	index: z.int().nonnegative(),
	reason: z.string(),
	runName: z.string().nullable(),
	sourceRef: z.string(),
});

export const ingestAttachmentPresignReceiptSchema = z.object({
	expiresInSeconds: z.int().positive(),
	rejected: z.array(ingestAttachmentRejectionSchema),
	storageConfigured: z.boolean(),
	uploads: z.array(ingestAttachmentUploadSchema),
});

export const ingestAttachmentRegisteredSchema = z.object({
	attachmentId: z.uuid(),
	index: z.int().nonnegative(),
	runCaseId: z.uuid(),
	storageKey: z.string(),
});

export const ingestAttachmentRegisterRejectionSchema = z.object({
	index: z.int().nonnegative(),
	reason: z.string(),
	runCaseId: z.uuid(),
	storageKey: z.string(),
});

export const ingestAttachmentRegisterReceiptSchema = z.object({
	registered: z.array(ingestAttachmentRegisteredSchema),
	rejected: z.array(ingestAttachmentRegisterRejectionSchema),
	storageConfigured: z.boolean(),
});

export type IngestAttachmentPresignRequestWire = z.input<
	typeof ingestAttachmentPresignRequestSchema
>;
export type IngestAttachmentPresignRequest = z.output<
	typeof ingestAttachmentPresignRequestSchema
>;
export type IngestAttachmentPresignItem = z.output<
	typeof ingestAttachmentPresignItemSchema
>;
export type IngestAttachmentPresignReceipt = z.output<
	typeof ingestAttachmentPresignReceiptSchema
>;
export type IngestAttachmentUpload = z.output<
	typeof ingestAttachmentUploadSchema
>;
export type IngestAttachmentRejection = z.output<
	typeof ingestAttachmentRejectionSchema
>;
export type IngestAttachmentRegisterRequestWire = z.input<
	typeof ingestAttachmentRegisterRequestSchema
>;
export type IngestAttachmentRegisterRequest = z.output<
	typeof ingestAttachmentRegisterRequestSchema
>;
export type IngestAttachmentRegisterItem = z.output<
	typeof ingestAttachmentRegisterItemSchema
>;
export type IngestAttachmentRegisterReceipt = z.output<
	typeof ingestAttachmentRegisterReceiptSchema
>;
export type IngestAttachmentRegistered = z.output<
	typeof ingestAttachmentRegisteredSchema
>;
export type IngestAttachmentRegisterRejection = z.output<
	typeof ingestAttachmentRegisterRejectionSchema
>;

import {
	listCaseAttachments,
	prepareCaseAttachmentUpload,
	registerCaseAttachment,
} from "@automationstack/db/repositories/case-attachments-repository";
import type { CaseAttachment } from "@automationstack/db/schema/case-attachments";
import { isR2Configured } from "@automationstack/env/server";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import { protectedProcedure } from "../index";
import {
	throwCaseImageViolation,
	verifyUploadedCaseImage,
} from "../lib/case-attachment-ingest";
import {
	buildCaseAttachmentStorageKey,
	isCaseAttachmentKeyOwnedBy,
	validateCaseImageUpload,
} from "../lib/case-attachment-policy";
import { presignCaseImageDownload } from "../lib/case-image-url";
import { requireCaseMember } from "../lib/project-scope";
import { getR2Storage, type R2Storage } from "../lib/r2";
import { caseAttachmentDraftProcedures } from "./case-attachment-drafts";

const caseAttachmentErrors = {
	BAD_REQUEST: {},
	NOT_FOUND: {},
} as const;

const sizeBytesSchema = z.number().int().positive();

const fileNameSchema = z.string().min(1).max(255);

const presignUploadSchema = z.object({
	caseId: z.uuid(),
	contentType: z.string().min(1),
	fileName: fileNameSchema,
	sizeBytes: sizeBytesSchema,
});

const registerSchema = z.object({
	caseId: z.uuid(),
	fileName: fileNameSchema,
	storageKey: z.string().min(1),
});

const caseSchema = z.object({ caseId: z.uuid() });

export interface CaseAttachmentView {
	attachment: CaseAttachment;
	url: string | null;
}

function requireStorage(): R2Storage {
	const storage = getR2Storage();
	if (storage === null) {
		throw new ORPCError("PRECONDITION_FAILED", {
			message: "附件存储（R2）未配置，无法粘贴图片",
		});
	}
	return storage;
}

export const caseAttachmentsRouter = {
	...caseAttachmentDraftProcedures,

	list: protectedProcedure
		.input(caseSchema)
		.use(requireCaseMember)
		.handler(async ({ input }): Promise<CaseAttachmentView[]> => {
			const attachments = await listCaseAttachments(input.caseId);
			const storage = getR2Storage();
			if (storage === null) {
				return attachments.map((attachment) => ({ attachment, url: null }));
			}
			return await Promise.all(
				attachments.map(async (attachment) => ({
					attachment,
					url: await presignCaseImageDownload(storage, attachment.storageKey),
				}))
			);
		}),

	presignUpload: protectedProcedure
		.errors(caseAttachmentErrors)
		.input(presignUploadSchema)
		.use(requireCaseMember)
		.handler(async ({ errors, input }) => {
			const storage = requireStorage();
			const declared = validateCaseImageUpload(input);
			if (declared.kind !== "ok") {
				throwCaseImageViolation(declared, input, errors, "declared");
			}
			const prepared = await prepareCaseAttachmentUpload(input.caseId);
			if (prepared.kind !== "ok") {
				throw errors.NOT_FOUND({ message: "用例不存在" });
			}
			const storageKey = buildCaseAttachmentStorageKey(prepared.scope, {
				contentType: input.contentType,
			});
			const uploadUrl = await storage.presignUpload(
				storageKey,
				input.contentType
			);
			return { storageKey, uploadUrl };
		}),

	register: protectedProcedure
		.errors(caseAttachmentErrors)
		.input(registerSchema)
		.use(requireCaseMember)
		.handler(async ({ context, errors, input }) => {
			const storage = requireStorage();
			const prepared = await prepareCaseAttachmentUpload(input.caseId);
			if (prepared.kind !== "ok") {
				throw errors.NOT_FOUND({ message: "用例不存在" });
			}
			const verified = await verifyUploadedCaseImage(
				{
					scope: prepared.scope,
					storage,
					storageKey: input.storageKey,
				},
				errors
			);
			const result = await registerCaseAttachment({
				caseId: input.caseId,
				contentType: verified.contentType,
				createdBy: context.user.id,
				fileName: input.fileName,
				isStorageKeyOwned: (scope) =>
					isCaseAttachmentKeyOwnedBy(input.storageKey, scope),
				sizeBytes: verified.sizeBytes,
				storageKey: input.storageKey,
			});
			if (result.kind === "invalid-storage-key") {
				throw errors.BAD_REQUEST({ message: "storageKey 不属于该用例" });
			}
			if (result.kind !== "registered") {
				throw errors.NOT_FOUND({ message: "用例不存在" });
			}
			return result.attachment;
		}),

	storageStatus: protectedProcedure.handler((): { configured: boolean } => ({
		configured: isR2Configured(),
	})),
};

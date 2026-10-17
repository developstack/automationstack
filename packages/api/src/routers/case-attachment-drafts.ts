import { randomUUID } from "node:crypto";

import { projectExists } from "@automationstack/db/repositories/projects-repository";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import { protectedProcedure, requireProjectMember } from "../index";
import { throwCaseImageViolation } from "../lib/case-attachment-ingest";
import {
	buildCaseAttachmentStorageKey,
	isCaseAttachmentKeyOwnedBy,
	validateCaseImageUpload,
} from "../lib/case-attachment-policy";
import { caseImageDownloadUrl } from "../lib/case-image-url";
import { getR2Storage } from "../lib/r2";
import { MAX_NEW_CASE_ATTACHMENTS } from "../schemas/case";

const sizeBytesSchema = z.number().int().positive();

const fileNameSchema = z.string().min(1).max(255);

/** 恢复草稿时一次签发的下载地址：与新用例一次可以保存的图片数量相同。 */
const MAX_DRAFT_DOWNLOAD_KEYS = MAX_NEW_CASE_ATTACHMENTS;

const presignDraftUploadSchema = z.object({
	caseId: z.uuid(),
	contentType: z.string().min(1),
	fileName: fileNameSchema,
	projectId: z.uuid(),
	sizeBytes: sizeBytesSchema,
});

const presignDraftDownloadSchema = z.object({
	caseId: z.uuid(),
	projectId: z.uuid(),
	storageKeys: z.array(z.string().min(1)).min(1).max(MAX_DRAFT_DOWNLOAD_KEYS),
});

export interface DraftAttachmentUrl {
	storageKey: string;
	url: string | null;
}

export const caseAttachmentDraftProcedures = {
	presignDraftDownload: protectedProcedure
		.errors({ BAD_REQUEST: {} })
		.input(presignDraftDownloadSchema)
		.use(requireProjectMember)
		.handler(async ({ errors, input }): Promise<DraftAttachmentUrl[]> => {
			const scope = { caseId: input.caseId, projectId: input.projectId };
			for (const storageKey of input.storageKeys) {
				if (!isCaseAttachmentKeyOwnedBy(storageKey, scope)) {
					throw errors.BAD_REQUEST({ message: "storageKey 不属于该用例" });
				}
			}
			const storage = getR2Storage();
			if (storage === null) {
				return input.storageKeys.map((storageKey) => ({
					storageKey,
					url: null,
				}));
			}
			return await Promise.all(
				input.storageKeys.map(async (storageKey) => ({
					storageKey,
					url: await caseImageDownloadUrl(storage, storageKey),
				}))
			);
		}),

	presignDraftUpload: protectedProcedure
		.errors({ BAD_REQUEST: {}, NOT_FOUND: {} })
		.input(presignDraftUploadSchema)
		.use(requireProjectMember)
		.handler(async ({ errors, input }) => {
			const storage = getR2Storage();
			if (storage === null) {
				throw new ORPCError("PRECONDITION_FAILED", {
					message: "附件存储（R2）未配置，无法粘贴图片",
				});
			}
			const declared = validateCaseImageUpload(input);
			if (declared.kind !== "ok") {
				throwCaseImageViolation(declared, input, errors, "declared");
			}
			if (!(await projectExists(input.projectId))) {
				throw errors.NOT_FOUND({ message: "项目不存在" });
			}
			const storageKey = buildCaseAttachmentStorageKey(
				{ caseId: input.caseId, projectId: input.projectId },
				{ contentType: input.contentType }
			);
			const uploadUrl = await storage.presignUpload(
				storageKey,
				input.contentType
			);
			return { attachmentId: randomUUID(), storageKey, uploadUrl };
		}),
};

import { randomUUID } from "node:crypto";

import { projectExists } from "@automationstack/db/repositories/projects-repository";
import { z } from "zod";

import { protectedProcedure, requireProjectMember } from "../index";
import { throwCaseImageViolation } from "../lib/case-attachment-ingest";
import {
	buildCaseAttachmentStorageKey,
	isCaseAttachmentKeyOwnedBy,
	validateCaseImageUpload,
} from "../lib/case-attachment-policy";
import { getObjectStorage } from "../lib/object-storage";
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
			const storage = await getObjectStorage();
			return await Promise.all(
				input.storageKeys.map(async (storageKey) => ({
					storageKey,
					url: await storage.caseImageUrl(storageKey),
				}))
			);
		}),

	presignDraftUpload: protectedProcedure
		.errors({ BAD_REQUEST: {}, NOT_FOUND: {} })
		.input(presignDraftUploadSchema)
		.use(requireProjectMember)
		.handler(async ({ errors, input }) => {
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
			const storage = await getObjectStorage();
			const uploadUrl = await storage.presignUpload(storageKey, {
				contentLength: input.sizeBytes,
				contentType: input.contentType,
			});
			return { attachmentId: randomUUID(), storageKey, uploadUrl };
		}),
};

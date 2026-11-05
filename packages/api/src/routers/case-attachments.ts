import {
	listCaseAttachments,
	prepareCaseAttachmentUpload,
	registerCaseAttachment,
} from "@automationstack/db/repositories/case-attachments-repository";
import type { CaseAttachment } from "@automationstack/db/schema/case-attachments";
import { isR2Configured } from "@automationstack/env/server";
import { z } from "zod";

import { protectedProcedure } from "../index";
import { verifyUploadedCaseImage } from "../lib/case-attachment-ingest";
import { isCaseAttachmentKeyOwnedBy } from "../lib/case-attachment-policy";
import {
	caseAttachmentErrors,
	presignCaseImageUpload,
	requireCaseImageStorage,
} from "../lib/case-image-presign";
import { caseImageDownloadUrl } from "../lib/case-image-url";
import { requireCaseMember } from "../lib/project-scope";
import { getR2Storage } from "../lib/r2";
import {
	caseImagePresignSchema,
	fileNameSchema,
} from "../schemas/case-attachment";
import { caseAttachmentDraftProcedures } from "./case-attachment-drafts";
import { caseScreenshotUploadProcedures } from "./case-screenshot-uploads";

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

export const caseAttachmentsRouter = {
	...caseAttachmentDraftProcedures,
	...caseScreenshotUploadProcedures,

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
					url: await caseImageDownloadUrl(storage, attachment.storageKey),
				}))
			);
		}),

	presignUpload: protectedProcedure
		.errors(caseAttachmentErrors)
		.input(caseImagePresignSchema)
		.use(requireCaseMember)
		.handler(async ({ errors, input }) => {
			const { storageKey, uploadUrl } = await presignCaseImageUpload(
				input,
				errors
			);
			return { storageKey, uploadUrl };
		}),

	register: protectedProcedure
		.errors(caseAttachmentErrors)
		.input(registerSchema)
		.use(requireCaseMember)
		.handler(async ({ context, errors, input }) => {
			const storage = requireCaseImageStorage();
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

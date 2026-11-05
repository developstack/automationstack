import {
	listCaseAttachments,
	prepareCaseAttachmentUpload,
	registerCaseAttachment,
} from "@automationstack/db/repositories/case-attachments-repository";
import type { CaseAttachment } from "@automationstack/db/schema/case-attachments";
import { z } from "zod";

import { protectedProcedure } from "../index";
import { verifyUploadedCaseImage } from "../lib/case-attachment-ingest";
import { isCaseAttachmentKeyOwnedBy } from "../lib/case-attachment-policy";
import {
	caseAttachmentErrors,
	presignCaseImageUpload,
} from "../lib/case-image-presign";
import { getObjectStorage } from "../lib/object-storage";
import { requireCaseMember } from "../lib/project-scope";
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
			const storage = await getObjectStorage();
			return await Promise.all(
				attachments.map(async (attachment) => ({
					attachment,
					url: await storage.caseImageUrl(attachment.storageKey),
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
			const storage = await getObjectStorage();
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

	// 没有配置 R2 时，文件存储在服务器本地，所以存储总是可用。保留这个接口，前端不需要改动。
	storageStatus: protectedProcedure.handler((): { configured: boolean } => ({
		configured: true,
	})),
};

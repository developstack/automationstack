import {
	listAttachments,
	prepareAttachmentUpload,
	registerAttachment,
	removeAttachment,
} from "@automationstack/db/repositories/test-run-attachments-repository";
import type { TestRunAttachment } from "@automationstack/db/schema/test-run-attachments";
import { isR2Configured } from "@automationstack/env/server";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import { protectedProcedure } from "../index";
import {
	throwAttachmentViolation,
	verifyUploadedObject,
} from "../lib/attachment-ingest";
import {
	buildAttachmentStorageKey,
	isAttachmentKeyOwnedBy,
	validateAttachmentUpload,
} from "../lib/attachment-policy";
import {
	requireRunAttachmentMember,
	requireRunCaseMember,
} from "../lib/project-scope";
import { getR2Storage, type R2Storage } from "../lib/r2";
import { publishInvalidate } from "../lib/realtime-publish";
import {
	isRunWriteLock,
	type RunWriteRejection,
	rejectRunWrite,
	type TestRunErrorThrowers,
	testRunErrors,
} from "../lib/test-run-errors";

const attachmentKindSchema = z.enum(["screenshot", "video", "log", "other"]);

const sizeBytesSchema = z.number().int().positive();

const presignUploadSchema = z.object({
	contentType: z.string().min(1),
	kind: attachmentKindSchema,
	runCaseId: z.uuid(),
	sizeBytes: sizeBytesSchema,
});

const registerSchema = z.object({
	fileName: z.string().min(1).max(255),
	kind: attachmentKindSchema,
	runCaseId: z.uuid(),
	storageKey: z.string().min(1),
});

const runCaseSchema = z.object({ runCaseId: z.uuid() });

const attachmentIdSchema = z.object({ attachmentId: z.uuid() });

export interface TestRunAttachmentView {
	attachment: TestRunAttachment;
	url: string | null;
}

function requireStorage(): R2Storage {
	const storage = getR2Storage();
	if (storage === null) {
		throw new ORPCError("PRECONDITION_FAILED", {
			message: "附件存储（R2）未配置，无法上传或删除附件",
		});
	}
	return storage;
}

function rejectAttachmentWrite(
	rejection: RunWriteRejection,
	errors: TestRunErrorThrowers,
	notFoundMessage: string
): never {
	if (isRunWriteLock(rejection)) {
		rejectRunWrite(rejection, errors);
	}
	throw errors.NOT_FOUND({ message: notFoundMessage });
}

export const testRunAttachmentsRouter = {
	list: protectedProcedure
		.input(runCaseSchema)
		.use(requireRunCaseMember)
		.handler(async ({ input }): Promise<TestRunAttachmentView[]> => {
			const attachments = await listAttachments(input.runCaseId);
			const storage = getR2Storage();
			if (storage === null) {
				return attachments.map((attachment) => ({ attachment, url: null }));
			}
			return await Promise.all(
				attachments.map(async (attachment) => ({
					attachment,
					url: await storage.presignDownload(attachment.storageKey),
				}))
			);
		}),

	presignUpload: protectedProcedure
		.errors(testRunErrors)
		.input(presignUploadSchema)
		.use(requireRunCaseMember)
		.handler(async ({ errors, input }) => {
			const storage = requireStorage();
			const declared = validateAttachmentUpload(input);
			if (declared.kind !== "ok") {
				throwAttachmentViolation(declared, input, errors, "declared");
			}
			const prepared = await prepareAttachmentUpload(input.runCaseId);
			if (prepared.kind !== "ok") {
				rejectAttachmentWrite(prepared, errors, "用例行不存在");
			}
			const storageKey = buildAttachmentStorageKey(prepared.scope, input);
			const uploadUrl = await storage.presignUpload(
				storageKey,
				input.contentType
			);
			return { storageKey, uploadUrl };
		}),

	register: protectedProcedure
		.errors(testRunErrors)
		.input(registerSchema)
		.use(requireRunCaseMember)
		.handler(async ({ context, errors, input }) => {
			const storage = requireStorage();
			const prepared = await prepareAttachmentUpload(input.runCaseId);
			if (prepared.kind !== "ok") {
				rejectAttachmentWrite(prepared, errors, "用例行不存在");
			}
			const verified = await verifyUploadedObject(
				{
					kind: input.kind,
					scope: prepared.scope,
					storage,
					storageKey: input.storageKey,
				},
				errors
			);
			const result = await registerAttachment({
				contentType: verified.contentType,
				createdBy: context.user.id,
				fileName: input.fileName,
				isStorageKeyOwned: (scope) =>
					isAttachmentKeyOwnedBy(input.storageKey, scope),
				kind: input.kind,
				runCaseId: input.runCaseId,
				sizeBytes: verified.sizeBytes,
				storageKey: input.storageKey,
			});
			if (result.kind === "invalid-storage-key") {
				throw errors.BAD_REQUEST({ message: "storageKey 不属于该用例行" });
			}
			if (result.kind !== "registered") {
				rejectAttachmentWrite(result, errors, "用例行不存在");
			}
			publishInvalidate({
				action: "update",
				context,
				entity: "testRun",
				ids: [result.scope.runId],
				projectId: result.scope.projectId,
			});
			return result.attachment;
		}),

	remove: protectedProcedure
		.errors(testRunErrors)
		.input(attachmentIdSchema)
		.use(requireRunAttachmentMember)
		.handler(async ({ context, errors, input }) => {
			const storage = requireStorage();
			const result = await removeAttachment(input.attachmentId);
			if (result.kind !== "removed") {
				rejectAttachmentWrite(result, errors, "附件不存在");
			}
			await storage.remove(result.attachment.storageKey);
			publishInvalidate({
				action: "update",
				context,
				entity: "testRun",
				ids: [result.scope.runId],
				projectId: result.scope.projectId,
			});
			return { id: result.attachment.id };
		}),

	storageStatus: protectedProcedure.handler((): { configured: boolean } => ({
		configured: isR2Configured(),
	})),
};

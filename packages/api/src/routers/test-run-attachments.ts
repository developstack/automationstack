import {
	listAttachments,
	prepareAttachmentUpload,
	registerStepAttachment,
	removeAttachment,
} from "@automationstack/db/repositories/test-run-attachments-repository";
import type { StepAttachmentRejection } from "@automationstack/db/repositories/test-run-step-attachments-core";
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
	type TestRunAttachmentView,
	withDownloadUrls,
} from "../lib/run-attachment-urls";
import {
	CASE_ATTACHMENT_READ_ONLY_MESSAGE,
	isStepAttachmentRejection,
	throwStepAttachmentRejection,
} from "../lib/step-attachment-errors";
import {
	isRunWriteLock,
	type RunWriteRejection,
	rejectRunWrite,
	type TestRunErrorThrowers,
	testRunErrors,
} from "../lib/test-run-errors";

/**
 * 人工上传的附件都是步骤的实际附件：截图或录屏，必须指定步骤。
 * 整条用例的附件只来自自动化上传（/ingest/attachments/*），这里不能再上传。
 */
const actualAttachmentKindSchema = z.enum(["screenshot", "video"]);

const sizeBytesSchema = z.number().int().positive();

const MAX_STEP_ID_LENGTH = 64;

const stepIdSchema = z.string().min(1).max(MAX_STEP_ID_LENGTH);

const presignUploadSchema = z.object({
	contentType: z.string().min(1),
	kind: actualAttachmentKindSchema,
	runCaseId: z.uuid(),
	sizeBytes: sizeBytesSchema,
	stepId: stepIdSchema,
});

const registerSchema = z.object({
	fileName: z.string().min(1).max(255),
	kind: actualAttachmentKindSchema,
	runCaseId: z.uuid(),
	stepId: stepIdSchema,
	storageKey: z.string().min(1),
});

const runCaseSchema = z.object({ runCaseId: z.uuid() });

const attachmentIdSchema = z.object({ attachmentId: z.uuid() });

function requireStorage(): R2Storage {
	const storage = getR2Storage();
	if (storage === null) {
		throw new ORPCError("PRECONDITION_FAILED", {
			message: "附件存储（R2）未配置，无法上传或删除附件",
		});
	}
	return storage;
}

type AttachmentWriteRejection =
	| RunWriteRejection
	| StepAttachmentRejection
	| { kind: "read-only" };

function rejectAttachmentWrite(
	rejection: AttachmentWriteRejection,
	errors: TestRunErrorThrowers,
	notFoundMessage: string
): never {
	if (isStepAttachmentRejection(rejection)) {
		throwStepAttachmentRejection(rejection, errors);
	}
	if (rejection.kind === "read-only") {
		throw errors.BAD_REQUEST({ message: CASE_ATTACHMENT_READ_ONLY_MESSAGE });
	}
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
			return await withDownloadUrls(attachments, getR2Storage());
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
			const prepared = await prepareAttachmentUpload(
				input.runCaseId,
				input.stepId
			);
			if (prepared.kind !== "ok") {
				rejectAttachmentWrite(prepared, errors, "用例行不存在");
			}
			const storageKey = buildAttachmentStorageKey(prepared.scope, input);
			const uploadUrl = await storage.presignUpload(storageKey, {
				contentLength: input.sizeBytes,
				contentType: input.contentType,
			});
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
			const result = await registerStepAttachment({
				contentType: verified.contentType,
				createdBy: context.user.id,
				fileName: input.fileName,
				isStorageKeyOwned: (scope) =>
					isAttachmentKeyOwnedBy(input.storageKey, scope),
				kind: input.kind,
				runCaseId: input.runCaseId,
				sizeBytes: verified.sizeBytes,
				stepId: input.stepId,
				storageKey: input.storageKey,
			});
			if (result.kind === "invalid-storage-key") {
				throw errors.BAD_REQUEST({ message: "storageKey 不属于该用例行" });
			}
			if (result.kind !== "registered") {
				// 不删除存储中的对象：storageKey 可能属于一个已经登记的附件（例如自动化上传的附件）
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

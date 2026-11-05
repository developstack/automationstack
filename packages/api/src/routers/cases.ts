import { findCaseAttachmentIds } from "@automationstack/db/repositories/case-attachments-repository";
import {
	listTestCases,
	MAX_PAGE_SIZE,
} from "@automationstack/db/repositories/case-list-repository";
import {
	createTestCase,
	updateTestCase,
} from "@automationstack/db/repositories/case-mutations-repository";
import { listProjectCaseTags } from "@automationstack/db/repositories/case-tags-repository";
import {
	getTestCaseById,
	moveTestCase,
	removeTestCase,
	reorderTestCases,
} from "@automationstack/db/repositories/test-cases-repository";
import { z } from "zod";

import type { Context } from "../context";
import { protectedProcedure, requireProjectMember } from "../index";
import { resolveNewCaseAttachments } from "../lib/case-attachment-draft-ingest";
import {
	columnScreenshotIds,
	FOREIGN_SCREENSHOT_MESSAGE,
	foreignScreenshotIds,
} from "../lib/case-column-screenshots";
import { getObjectStorage } from "../lib/object-storage";
import { requireCaseMember, requireModuleMember } from "../lib/project-scope";
import { publishInvalidate } from "../lib/realtime-publish";
import {
	caseConflictDataSchema,
	caseContentPatchSchema,
	caseContentSchema,
	caseListFilterSchema,
	createCaseAttachmentSchema,
	MAX_NEW_CASE_ATTACHMENTS,
} from "../schemas/case";
import { caseImportProcedures } from "./case-import";
import { caseRemoveProcedures } from "./case-remove";
import { caseStatusProcedures } from "./case-status";
import { caseVersionProcedures } from "./case-versions";

const listCasesSchema = caseListFilterSchema.extend({
	page: z.number().int().min(1).optional(),
	pageSize: z.number().int().min(1).max(MAX_PAGE_SIZE).optional(),
});

const createCaseSchema = caseContentSchema.extend({
	// 数量上限在 handler 中检查，错误信息说明上限（见 tooManyAttachmentsMessage）
	attachments: z.array(createCaseAttachmentSchema).optional(),
	id: z.uuid().optional(),
	index: z.number().int().min(0).optional(),
	moduleId: z.uuid(),
	projectId: z.uuid(),
});

const updateCaseSchema = z.object({
	changeNote: z.string().nullable().optional(),
	expectedVersion: z.number().int().min(1),
	id: z.uuid(),
	patch: caseContentPatchSchema,
});

const moveCaseSchema = z.object({
	id: z.uuid(),
	index: z.number().int().min(0).optional(),
	moduleId: z.uuid(),
});

const reorderCasesSchema = z.object({
	moduleId: z.uuid(),
	orderedIds: z.array(z.uuid()).min(1),
});

const toCaseScope = (input: { id: string }) => ({ caseId: input.id });

function tooManyAttachmentsMessage(count: number): string {
	return `新用例一次最多保存 ${MAX_NEW_CASE_ATTACHMENTS} 张图片，这次有 ${count} 张。请减少图片后再保存`;
}

function actorName(context: Context): string | null {
	return context.actor?.name ?? null;
}

export const casesRouter = {
	...caseImportProcedures,
	...caseRemoveProcedures,
	...caseStatusProcedures,
	...caseVersionProcedures,
	create: protectedProcedure
		.errors({ BAD_REQUEST: {}, CONFLICT: {} })
		.input(createCaseSchema)
		.use(requireProjectMember)
		.handler(async ({ context, errors, input }) => {
			const attachmentCount = input.attachments?.length ?? 0;
			if (attachmentCount > MAX_NEW_CASE_ATTACHMENTS) {
				throw errors.BAD_REQUEST({
					message: tooManyAttachmentsMessage(attachmentCount),
				});
			}
			// 新用例的截图只能是这次一起提交的新附件
			const newAttachmentIds = new Set(
				(input.attachments ?? []).map((attachment) => attachment.id)
			);
			if (foreignScreenshotIds(input.steps, newAttachmentIds).length > 0) {
				throw errors.BAD_REQUEST({ message: FOREIGN_SCREENSHOT_MESSAGE });
			}
			const attachments = await resolveNewCaseAttachments(
				{
					attachments: input.attachments,
					createdBy: context.user.id,
					id: input.id,
					projectId: input.projectId,
					storage: await getObjectStorage(),
				},
				errors
			);
			const result = await createTestCase({
				...input,
				actorName: actorName(context),
				attachments,
			});
			if (result.kind === "duplicate-id") {
				throw errors.CONFLICT({
					message: "该用例已创建，请勿重复保存",
				});
			}
			if (result.kind !== "created") {
				throw errors.BAD_REQUEST({
					message: "目标模块不存在或不属于该项目",
				});
			}
			publishInvalidate({
				action: "create",
				context,
				entity: "case",
				ids: [result.testCase.id],
				moduleId: result.testCase.moduleId,
				projectId: result.testCase.projectId,
			});
			return { testCase: result.testCase, version: result.version };
		}),
	get: protectedProcedure
		.errors({ NOT_FOUND: {} })
		.input(z.object({ id: z.uuid() }))
		.use(requireCaseMember, toCaseScope)
		.handler(async ({ errors, input }) => {
			const testCase = await getTestCaseById(input.id);
			if (!testCase) {
				throw errors.NOT_FOUND({ message: "用例不存在" });
			}
			return testCase;
		}),
	list: protectedProcedure
		.input(listCasesSchema)
		.use(requireProjectMember)
		.handler(({ input }) => listTestCases(input)),
	listTags: protectedProcedure
		.input(z.object({ projectId: z.uuid() }))
		.use(requireProjectMember)
		.handler(({ input }) => listProjectCaseTags(input.projectId)),
	move: protectedProcedure
		.errors({ BAD_REQUEST: {}, NOT_FOUND: {} })
		.input(moveCaseSchema)
		.use(requireCaseMember, toCaseScope)
		.handler(async ({ context, errors, input }) => {
			const result = await moveTestCase(input);
			if (result.kind === "ok") {
				publishInvalidate({
					action: "move",
					context,
					entity: "case",
					ids: [result.testCase.id],
					moduleId: result.testCase.moduleId,
					projectId: result.testCase.projectId,
				});
				return result.testCase;
			}
			if (result.kind === "invalid-module") {
				throw errors.BAD_REQUEST({
					message: "目标模块不存在或不属于同一项目",
				});
			}
			throw errors.NOT_FOUND({ message: "用例不存在" });
		}),
	remove: protectedProcedure
		.errors({ CONFLICT: {}, NOT_FOUND: {} })
		.input(z.object({ id: z.uuid() }))
		.use(requireCaseMember, toCaseScope)
		.handler(async ({ context, errors, input }) => {
			const result = await removeTestCase(input.id);
			if (result.kind === "not-found") {
				throw errors.NOT_FOUND({ message: "用例不存在" });
			}
			if (result.kind === "blocked") {
				throw errors.CONFLICT({
					message: `该用例被 ${result.referencedByRunCount} 个测试任务引用，无法删除；可改为「废弃」状态`,
				});
			}
			publishInvalidate({
				action: "delete",
				context,
				entity: "case",
				ids: [result.testCase.id],
				moduleId: result.testCase.moduleId,
				projectId: result.testCase.projectId,
			});
			return { id: input.id };
		}),
	reorder: protectedProcedure
		.errors({ BAD_REQUEST: {} })
		.input(reorderCasesSchema)
		.use(requireModuleMember)
		.handler(async ({ context, errors, input }) => {
			const result = await reorderTestCases(input);
			if (result.kind === "invalid-set") {
				throw errors.BAD_REQUEST({
					message: "orderedIds 与该模块现有用例不一致",
				});
			}
			publishInvalidate({
				action: "move",
				context,
				entity: "case",
				ids: input.orderedIds,
				moduleId: input.moduleId,
				projectId: result.projectId,
			});
			return { ok: true };
		}),
	update: protectedProcedure
		.errors({
			BAD_REQUEST: {},
			CONFLICT: { data: caseConflictDataSchema },
			NOT_FOUND: {},
		})
		.input(updateCaseSchema)
		.use(requireCaseMember, toCaseScope)
		.handler(async ({ context, errors, input }) => {
			const screenshotIds = columnScreenshotIds(input.patch.steps);
			const owned = await findCaseAttachmentIds(input.id, screenshotIds);
			if (foreignScreenshotIds(input.patch.steps, owned).length > 0) {
				throw errors.BAD_REQUEST({ message: FOREIGN_SCREENSHOT_MESSAGE });
			}
			const result = await updateTestCase({
				actorName: actorName(context),
				changeNote: input.changeNote,
				expectedVersion: input.expectedVersion,
				id: input.id,
				patch: input.patch,
			});
			if (result.kind === "written") {
				publishInvalidate({
					action: "update",
					context,
					entity: "case",
					ids: [result.testCase.id],
					moduleId: result.testCase.moduleId,
					projectId: result.testCase.projectId,
				});
				return { testCase: result.testCase, version: result.version };
			}
			if (result.kind === "unchanged") {
				return { testCase: result.testCase, version: null };
			}
			if (result.kind === "conflict") {
				throw errors.CONFLICT({
					data: {
						currentVersion: result.currentVersion,
						lastModifiedBy: result.lastModifiedBy,
					},
					message: "保存冲突：用例已被他人修改",
				});
			}
			throw errors.NOT_FOUND({ message: "用例不存在" });
		}),
};

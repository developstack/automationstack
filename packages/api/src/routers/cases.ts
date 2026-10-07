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
import { requireCaseMember, requireModuleMember } from "../lib/project-scope";
import { getR2Storage } from "../lib/r2";
import { publishInvalidate } from "../lib/realtime-publish";
import {
	caseConflictDataSchema,
	caseContentPatchSchema,
	caseContentSchema,
	casePrioritySchema,
	caseStatusSchema,
	createCaseAttachmentSchema,
	MAX_NEW_CASE_ATTACHMENTS,
} from "../schemas/case";
import { caseImportProcedures } from "./case-import";
import { caseVersionProcedures } from "./case-versions";

const listCasesSchema = z.object({
	includeDescendants: z.boolean().optional(),
	keyword: z.string().optional(),
	moduleId: z.uuid().optional(),
	page: z.number().int().min(1).optional(),
	pageSize: z.number().int().min(1).max(MAX_PAGE_SIZE).optional(),
	priority: z.array(casePrioritySchema).optional(),
	projectId: z.uuid(),
	sourceRefPrefix: z.string().min(1).optional(),
	status: caseStatusSchema.optional(),
	tags: z.array(z.string()).optional(),
});

const createCaseSchema = caseContentSchema.extend({
	attachments: z
		.array(createCaseAttachmentSchema)
		.max(MAX_NEW_CASE_ATTACHMENTS)
		.optional(),
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

function actorName(context: Context): string | null {
	return context.actor?.name ?? null;
}

export const casesRouter = {
	...caseImportProcedures,
	...caseVersionProcedures,
	create: protectedProcedure
		.errors({ BAD_REQUEST: {}, CONFLICT: {} })
		.input(createCaseSchema)
		.use(requireProjectMember)
		.handler(async ({ context, errors, input }) => {
			const attachments = await resolveNewCaseAttachments(
				{
					attachments: input.attachments,
					createdBy: context.user.id,
					id: input.id,
					projectId: input.projectId,
					storage: getR2Storage(),
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
			CONFLICT: { data: caseConflictDataSchema },
			NOT_FOUND: {},
		})
		.input(updateCaseSchema)
		.use(requireCaseMember, toCaseScope)
		.handler(async ({ context, errors, input }) => {
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

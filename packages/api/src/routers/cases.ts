import {
	createTestCase,
	updateTestCase,
} from "@automationstack/db/repositories/case-mutations-repository";
import { listProjectCaseTags } from "@automationstack/db/repositories/case-tags-repository";
import {
	getTestCaseById,
	listTestCases,
	MAX_PAGE_SIZE,
	moveTestCase,
	removeTestCase,
	reorderTestCases,
} from "@automationstack/db/repositories/test-cases-repository";
import { z } from "zod";

import type { Context } from "../context";
import { protectedProcedure } from "../index";
import { publishInvalidate } from "../lib/realtime-publish";
import {
	caseConflictDataSchema,
	caseContentPatchSchema,
	caseContentSchema,
	casePrioritySchema,
	caseStatusSchema,
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
	status: caseStatusSchema.optional(),
	/** 标签筛选（any-of：命中任意一个即匹配）；空数组等同不筛选。 */
	tags: z.array(z.string()).optional(),
});

const createCaseSchema = caseContentSchema.extend({
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

function actorName(context: Context): string | null {
	return context.actor?.name ?? null;
}

export const casesRouter = {
	...caseImportProcedures,
	...caseVersionProcedures,
	create: protectedProcedure
		.errors({ BAD_REQUEST: {} })
		.input(createCaseSchema)
		.handler(async ({ context, errors, input }) => {
			const result = await createTestCase({
				...input,
				actorName: actorName(context),
			});
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
		.handler(async ({ errors, input }) => {
			const testCase = await getTestCaseById(input.id);
			if (!testCase) {
				throw errors.NOT_FOUND({ message: "用例不存在" });
			}
			return testCase;
		}),
	list: protectedProcedure
		.input(listCasesSchema)
		.handler(({ input }) => listTestCases(input)),
	/** 供筛选器填候选项：项目内全部用例用过的标签，去重且按名称升序。 */
	listTags: protectedProcedure
		.input(z.object({ projectId: z.uuid() }))
		.handler(({ input }) => listProjectCaseTags(input.projectId)),
	move: protectedProcedure
		.errors({ BAD_REQUEST: {}, NOT_FOUND: {} })
		.input(moveCaseSchema)
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
		.errors({ NOT_FOUND: {} })
		.input(z.object({ id: z.uuid() }))
		.handler(async ({ context, errors, input }) => {
			const removed = await removeTestCase(input.id);
			if (!removed) {
				throw errors.NOT_FOUND({ message: "用例不存在" });
			}
			publishInvalidate({
				action: "delete",
				context,
				entity: "case",
				ids: [removed.id],
				moduleId: removed.moduleId,
				projectId: removed.projectId,
			});
			return { id: input.id };
		}),
	reorder: protectedProcedure
		.errors({ BAD_REQUEST: {} })
		.input(reorderCasesSchema)
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
			// 空保存：没建版本，别人的界面上也没有任何东西会变，所以不广播失效。
			// `version: null` 就是客户端识别「这次没产生新版本」的信号。
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

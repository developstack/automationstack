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
import { protectedProcedure } from "../index";
import { resolveNewCaseAttachments } from "../lib/case-attachment-draft-ingest";
import { getR2Storage } from "../lib/r2";
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

/**
 * 一张随新用例一起登记的草稿贴图。三个字段全部来自
 * `caseAttachments.presignDraftUpload` 的返回值 + 用户粘贴时的文件名。
 *
 * **刻意不收 contentType / sizeBytes**，与 `caseAttachments.register` 同一条约定：
 * 预签名 URL 一发出去，实际传了多大、传的什么类型就不再受我们控制，
 * 落库的那两个值一律来自服务端的 `HeadObject`。
 */
const createCaseAttachmentSchema = z.object({
	fileName: z.string().min(1).max(255),
	/** presign 阶段就定下的 id，正文里的 `![](attachment:<id>)` 引的就是它。 */
	id: z.uuid(),
	storageKey: z.string().min(1),
});

/** 一次建用例最多带 50 张图，与 `presignDraftDownload` 的上限保持一致。 */
const MAX_NEW_CASE_ATTACHMENTS = 50;

const createCaseSchema = caseContentSchema.extend({
	/**
	 * 新建用例时贴的图。**可选**：AI 采纳 / 导入 / 脑图建用例都不传，
	 * 不传时这条路径与加这个字段之前完全一致（一次 R2 请求都不发）。
	 */
	attachments: z
		.array(createCaseAttachmentSchema)
		.max(MAX_NEW_CASE_ATTACHMENTS)
		.optional(),
	/**
	 * 客户端预生成的主键（`crypto.randomUUID()`）。带 `attachments` 时**必填**：
	 * 贴图的 object key 前缀里就有它，没有它就无从判断那些 key 属于谁。
	 * 不传则沿用数据库列上的 `defaultRandom()`。
	 */
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

function actorName(context: Context): string | null {
	return context.actor?.name ?? null;
}

export const casesRouter = {
	...caseImportProcedures,
	...caseVersionProcedures,
	/**
	 * 建用例。带 `id` + `attachments` 时同时把草稿态贴图登记进库。
	 *
	 * 顺序是硬要求：**归属校验 → `HeadObject` → 建用例**。
	 * 前两步全部发生在事务之前（`resolveNewCaseAttachments` 里），
	 * 因为这条链路的硬约束是**绝不在数据库事务里发网络请求**——
	 * 一次保存最多 50 个 HeadObject，把它们放进事务等于让一个写事务
	 * 按外部网络的延迟持锁。到 repository 那一层时，附件行已经全是既成事实。
	 */
	create: protectedProcedure
		.errors({ BAD_REQUEST: {}, CONFLICT: {} })
		.input(createCaseSchema)
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
			// 同一份 localStorage 草稿在两个标签页各点了一次保存。第二次不是故障，
			// 是「这条用例已经建好了」——用 CONFLICT 而不是 BAD_REQUEST：
			// 请求本身完全合法，输入一个字都不用改，前端该做的是去把那条已存在的
			// 用例打开（id 它自己就有），语义与 cases.update 的乐观锁冲突同一类。
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
		.errors({ CONFLICT: {}, NOT_FOUND: {} })
		.input(z.object({ id: z.uuid() }))
		.handler(async ({ context, errors, input }) => {
			const result = await removeTestCase(input.id);
			if (result.kind === "not-found") {
				throw errors.NOT_FOUND({ message: "用例不存在" });
			}
			// 被测试任务引用的用例不能删（plan §3.4）：删了会让历史测试任务的统计数字
			// 自己变化，报告不可复现。出口是把用例改成「废弃」状态。
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

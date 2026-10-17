import { z } from "zod";

export const casePrioritySchema = z.enum(["P0", "P1", "P2", "P3"]);

export const caseTypeSchema = z.enum([
	"functional",
	"interface",
	"performance",
	"security",
	"compatibility",
	"other",
]);

export const caseStatusSchema = z.enum(["draft", "active", "deprecated"]);

/** 一次批量操作（改状态、删除）最多的用例数，与用例列表一页的上限相同。前端在请求前按这个上限检查。 */
export const MAX_BATCH_CASES = 100;

/** 只改一组用例的状态（cases.changeStatus 和 MCP 的 change_case_status）。 */
export const changeCaseStatusSchema = z.object({
	ids: z
		.array(z.uuid())
		.min(1)
		.max(MAX_BATCH_CASES)
		.describe(
			`Ids of the cases to change (from read_cases or search_cases), 1-${MAX_BATCH_CASES}, all in one project.`
		),
	status: caseStatusSchema.describe("The new status of every listed case."),
});

/** 批量删除用例（cases.removeMany 和 MCP 的 delete_cases）。 */
export const removeCasesSchema = z.object({
	ids: z
		.array(z.uuid())
		.min(1)
		.max(MAX_BATCH_CASES)
		.describe(
			`Ids of the cases to delete (from read_cases or search_cases), 1-${MAX_BATCH_CASES}, all in one project.`
		),
});

/**
 * 按筛选条件批量处理时最多的用例数（用例列表 50 页）。一次批量操作是一个事务，事务中的用例
 * 逐条加锁和写入，改状态时每条还记录一个新版本。上限让事务的大小和加锁的时间有界：
 * 其他人保存这些用例时，最多等这一个事务完成。超过上限时缩小筛选范围，分几次处理。
 */
export const MAX_FILTER_BATCH_CASES = 1000;

export const FILTER_BATCH_TOO_MANY_MESSAGE = `符合筛选的用例超过 ${MAX_FILTER_BATCH_CASES} 条，一次最多处理 ${MAX_FILTER_BATCH_CASES} 条，请缩小筛选范围`;

/** 用例列表的筛选条件。cases.list 和按筛选条件的批量操作使用同一个筛选，所以条数和处理的用例一致。 */
export const caseListFilterSchema = z.object({
	includeDescendants: z.boolean().optional(),
	keyword: z.string().optional(),
	moduleId: z.uuid().optional(),
	priority: z.array(casePrioritySchema).optional(),
	projectId: z.uuid(),
	sourceRefPrefix: z.string().min(1).optional(),
	status: caseStatusSchema.optional(),
	tags: z.array(z.string()).optional(),
});

/**
 * cases.changeStatus 的输入，三种之一：
 * - 勾选的用例 { ids, status }，最多 MAX_BATCH_CASES 条；
 * - 撤销 { ids, status, undo: true }：恢复按筛选条件修改的用例，最多 MAX_FILTER_BATCH_CASES 条。
 *   服务端不核对这是不是撤销：按筛选条件本来就可以一次修改这么多条，事务的上限相同；
 * - 全部符合筛选的用例 { filter, status }，由服务端按筛选条件找出用例。
 */
export const changeCaseStatusInputSchema = z.union([
	changeCaseStatusSchema,
	z.object({
		ids: z.array(z.uuid()).min(1).max(MAX_FILTER_BATCH_CASES),
		status: caseStatusSchema,
		undo: z.literal(true),
	}),
	z.object({ filter: caseListFilterSchema, status: caseStatusSchema }),
]);

/** cases.removeMany 的输入：勾选的用例 { ids }，或全部符合筛选的用例 { filter }。 */
export const removeCasesInputSchema = z.union([
	removeCasesSchema,
	z.object({ filter: caseListFilterSchema }),
]);

/** 用例的一个步骤。多余的字段被丢弃，例如已经删除的 screenshots。 */
export const caseStepSchema = z.object({
	expected: z.string(),
	id: z.string().min(1),
	step: z.string(),
});

export const caseContentSchema = z.object({
	caseType: caseTypeSchema.default("functional"),
	maintainer: z.string().nullable().default(null),
	name: z.string().min(1),
	preconditions: z.string().nullable().default(null),
	priority: casePrioritySchema.default("P2"),
	sourceRef: z.string().nullable().default(null),
	status: caseStatusSchema.default("draft"),
	steps: z.array(caseStepSchema).default([]),
	tags: z.array(z.string()).default([]),
});

export const caseContentPatchSchema = z.object({
	caseType: caseTypeSchema.optional(),
	maintainer: z.string().nullable().optional(),
	name: z.string().min(1).optional(),
	preconditions: z.string().nullable().optional(),
	priority: casePrioritySchema.optional(),
	sourceRef: z.string().nullable().optional(),
	status: caseStatusSchema.optional(),
	steps: z.array(caseStepSchema).optional(),
	tags: z.array(z.string()).optional(),
});

export const importCaseSchema = caseContentSchema.extend({
	moduleId: z.uuid(),
});

export const importOnDuplicateSchema = z.enum([
	"skip",
	"overwrite",
	"create-anyway",
]);

export const createCaseAttachmentSchema = z.object({
	fileName: z.string().min(1).max(255),
	id: z.uuid(),
	storageKey: z.string().min(1),
});

export const MAX_NEW_CASE_ATTACHMENTS = 50;

export const caseConflictDataSchema = z.object({
	currentVersion: z.number().int(),
	lastModifiedBy: z.string().nullable(),
});

export type CaseContentInput = z.infer<typeof caseContentSchema>;
export type CaseContentPatchInput = z.infer<typeof caseContentPatchSchema>;

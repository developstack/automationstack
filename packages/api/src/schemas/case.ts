import { z } from "zod";

import { MAX_FILE_NAME_LENGTH } from "./case-attachment";

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
 * cases.changeStatus 的输入，两种之一：
 * - 勾选的用例 { ids, status }，最多 MAX_BATCH_CASES 条；
 * - 全部符合筛选的用例 { filter, status }，由服务端按筛选条件找出用例。
 * 撤销不用这个输入，用 cases.undoStatusChange 和修改时返回的撤销凭证（见 undoCaseStatusChangeSchema）。
 */
export const changeCaseStatusInputSchema = z.union([
	changeCaseStatusSchema,
	z.object({ filter: caseListFilterSchema, status: caseStatusSchema }),
]);

/**
 * 撤销凭证最多的字符数。凭证中有改过的用例和各自原来的状态，按筛选条件修改时最多
 * MAX_FILTER_BATCH_CASES 条，约 52 KB。上限留出余量，并让校验签名的工作量有界。
 */
const MAX_UNDO_TOKEN_KIB = 128;
const CHARS_PER_KIB = 1024;
export const MAX_UNDO_TOKEN_LENGTH = MAX_UNDO_TOKEN_KIB * CHARS_PER_KIB;

/** cases.undoStatusChange 的输入：cases.changeStatus 返回的撤销凭证（undoToken）。 */
export const undoCaseStatusChangeSchema = z.object({
	token: z.string().min(1, "撤销凭证不能为空").max(MAX_UNDO_TOKEN_LENGTH),
});

export const CASE_STATUS_UNDO_EXPIRED_MESSAGE =
	"撤销已过期，请手动修改用例状态";

/** cases.removeMany 的输入：勾选的用例 { ids }，或全部符合筛选的用例 { filter }。 */
export const removeCasesInputSchema = z.union([
	removeCasesSchema,
	z.object({ filter: caseListFilterSchema }),
]);

/** 每个步骤每组截图（操作截图、预期截图）最多的数量。 */
export const MAX_COLUMN_SCREENSHOTS = 9;

/**
 * 步骤的文字部分，多余的字段被丢弃。没有截图字段时，id 相同的步骤保留现有的截图
 * （见 mergeColumnScreenshots）。
 */
export const caseStepSchema = z.object({
	expected: z.string(),
	id: z.string().min(1),
	step: z.string(),
});

function screenshotGroupSchema(
	label: string,
	item: { schema: z.ZodType<string>; unit: string }
) {
	return z
		.array(item.schema)
		.max(
			MAX_COLUMN_SCREENSHOTS,
			`每个步骤最多 ${MAX_COLUMN_SCREENSHOTS} 张${label}`
		)
		.refine((ids) => new Set(ids).size === ids.length, {
			message: `${label}中有重复的${item.unit}`,
		});
}

const attachmentIdItem = { schema: z.uuid(), unit: "附件 id" };

/** MCP 写入截图时引用的上传凭证（见 lib/case-screenshot-upload-token）。 */
const uploadTokenItem = {
	schema: z.string().min(1, "上传凭证不能为空"),
	unit: "上传凭证",
};

/** 用例编辑区写入的步骤：可以带操作截图和预期截图（用例附件 id）。不带的一组保留现有的截图。 */
export const caseStepWithScreenshotsSchema = caseStepSchema.extend({
	actionScreenshots: screenshotGroupSchema(
		"操作截图",
		attachmentIdItem
	).optional(),
	expectedScreenshots: screenshotGroupSchema(
		"预期截图",
		attachmentIdItem
	).optional(),
});

/**
 * 导入（MCP 的 import_test_cases）写入的步骤：截图是上传凭证，写入前换成附件 id。
 * 给出的一组整组替换，不给的一组保留现有的截图。
 */
export const importCaseStepSchema = caseStepSchema.extend({
	actionScreenshots: screenshotGroupSchema(
		"操作截图",
		uploadTokenItem
	).optional(),
	expectedScreenshots: screenshotGroupSchema(
		"预期截图",
		uploadTokenItem
	).optional(),
});

export const caseContentSchema = z.object({
	caseType: caseTypeSchema.default("functional"),
	maintainer: z.string().nullable().default(null),
	name: z.string().min(1),
	preconditions: z.string().nullable().default(null),
	priority: casePrioritySchema.default("P2"),
	sourceRef: z.string().nullable().default(null),
	status: caseStatusSchema.default("draft"),
	steps: z.array(caseStepWithScreenshotsSchema).default([]),
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
	steps: z.array(caseStepWithScreenshotsSchema).optional(),
	tags: z.array(z.string()).optional(),
});

export const importCaseSchema = caseContentSchema.extend({
	moduleId: z.uuid(),
	steps: z.array(importCaseStepSchema).default([]),
});

export const importOnDuplicateSchema = z.enum([
	"skip",
	"overwrite",
	"create-anyway",
]);

export const createCaseAttachmentSchema = z.object({
	fileName: z.string().min(1).max(MAX_FILE_NAME_LENGTH),
	id: z.uuid(),
	storageKey: z.string().min(1),
});

/**
 * 新建一条用例时一次可以引用的附件数量（正文图片、操作截图和预期截图），MCP 导入的一行也使用这个上限。
 * 每组截图最多 MAX_COLUMN_SCREENSHOTS 张，步骤数量不限，所以上限要足够大。
 */
export const MAX_NEW_CASE_ATTACHMENTS = 200;

export const caseConflictDataSchema = z.object({
	currentVersion: z.number().int(),
	lastModifiedBy: z.string().nullable(),
});

export type CaseContentInput = z.infer<typeof caseContentSchema>;
export type CaseContentPatchInput = z.infer<typeof caseContentPatchSchema>;

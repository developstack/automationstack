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

/** 每个步骤最多的步骤截图数量。 */
export const MAX_STEP_SCREENSHOTS = 9;

/** 外部工具（导入、MCP）写入的步骤：不带步骤截图，多余的字段被丢弃。 */
export const caseStepSchema = z.object({
	expected: z.string(),
	id: z.string().min(1),
	step: z.string(),
});

const stepScreenshotsSchema = z
	.array(z.uuid())
	.max(MAX_STEP_SCREENSHOTS, `每个步骤最多 ${MAX_STEP_SCREENSHOTS} 张步骤截图`)
	.refine((ids) => new Set(ids).size === ids.length, {
		message: "步骤截图中有重复的附件 id",
	});

/** 用例编辑区写入的步骤：可以带步骤截图（用例附件 id）。 */
export const caseStepWithScreenshotsSchema = caseStepSchema.extend({
	screenshots: stepScreenshotsSchema.optional(),
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
	steps: z.array(caseStepSchema).default([]),
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

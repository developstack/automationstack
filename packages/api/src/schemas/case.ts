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

export const caseStepSchema = z.object({
	expected: z.string(),
	id: z.string().min(1),
	step: z.string(),
});

/** Full user-editable content of a test case (shared with AI tools later). */
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

/** Partial patch used by cases.update — only provided fields are written. */
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

/** One case in cases.importBatch: full content plus its target module. */
export const importCaseSchema = caseContentSchema.extend({
	moduleId: z.uuid(),
});

export const importOnDuplicateSchema = z.enum([
	"skip",
	"overwrite",
	"create-anyway",
]);

/**
 * 一张随新用例一起登记的草稿贴图。三个字段全部来自
 * `caseAttachments.presignDraftUpload` 的返回值 + 用户粘贴时的文件名。
 *
 * **刻意不收 contentType / sizeBytes**，与 `caseAttachments.register` 同一条约定：
 * 预签名 URL 一发出去，实际传了多大、传的什么类型就不再受我们控制，
 * 落库的那两个值一律来自服务端的 `HeadObject`。
 */
export const createCaseAttachmentSchema = z.object({
	fileName: z.string().min(1).max(255),
	/** presign 阶段就定下的 id，正文里的 `![](attachment:<id>)` 引的就是它。 */
	id: z.uuid(),
	storageKey: z.string().min(1),
});

/** 一次建用例最多带 50 张图，与 `presignDraftDownload` 的上限保持一致。 */
export const MAX_NEW_CASE_ATTACHMENTS = 50;

/** Data payload of the typed CONFLICT error (optimistic lock). */
export const caseConflictDataSchema = z.object({
	currentVersion: z.number().int(),
	lastModifiedBy: z.string().nullable(),
});

/** Shape produced by the AI generation agent for a proposed case. */
export const proposedCaseSchema = z.object({
	caseType: caseTypeSchema.default("functional"),
	name: z.string().min(1),
	preconditions: z.string().nullable().default(null),
	priority: casePrioritySchema.default("P2"),
	steps: z.array(caseStepSchema).default([]),
	tags: z.array(z.string()).default([]),
});

export type CaseContentInput = z.infer<typeof caseContentSchema>;
export type CaseContentPatchInput = z.infer<typeof caseContentPatchSchema>;
export type ProposedCaseInput = z.infer<typeof proposedCaseSchema>;

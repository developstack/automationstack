import { sql } from "drizzle-orm";
import {
	index,
	integer,
	jsonb,
	pgEnum,
	pgTable,
	text,
	timestamp,
	unique,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";

import { modules } from "./modules";
import { projects } from "./projects";

export const casePriorityEnum = pgEnum("case_priority", [
	"P0",
	"P1",
	"P2",
	"P3",
]);

export const caseTypeEnum = pgEnum("case_type", [
	"functional",
	"interface",
	"performance",
	"security",
	"compatibility",
	"other",
]);

export const caseStatusEnum = pgEnum("case_status", [
	"draft",
	"active",
	"deprecated",
]);

export type CasePriority = (typeof casePriorityEnum.enumValues)[number];
export type CaseType = (typeof caseTypeEnum.enumValues)[number];
export type CaseStatus = (typeof caseStatusEnum.enumValues)[number];

/**
 * 用例的单个操作步骤，落在 `test_cases.steps` 这一列的 jsonb 数组里。
 *
 * 定义就在这里：以前它归 `@automationstack/agent`（在线 AI agent 产出提案时
 * 要描述步骤，而那个包零 db 依赖、不能反向 import 本文件），本文件只做同名
 * 再导出。在线 agent 整条栈删掉之后那个包没了，定义搬回它唯一的落库处；
 * 全仓十余处 `from "@automationstack/db/schema/test-cases"` 的 import 路径
 * 一处都不用改。
 */
export interface CaseStep {
	expected: string;
	id: string;
	step: string;
}

export const testCases = pgTable(
	"test_cases",
	{
		caseType: caseTypeEnum("case_type").notNull().default("functional"),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		currentVersion: integer("current_version").notNull().default(1),
		id: uuid("id").primaryKey().defaultRandom(),
		lastModifiedBy: text("last_modified_by"),
		maintainer: text("maintainer"),
		moduleId: uuid("module_id")
			.notNull()
			.references(() => modules.id, { onDelete: "cascade" }),
		name: text("name").notNull(),
		preconditions: text("preconditions"),
		priority: casePriorityEnum("priority").notNull().default("P2"),
		projectId: uuid("project_id")
			.notNull()
			.references(() => projects.id, { onDelete: "cascade" }),
		sortOrder: integer("sort_order").notNull().default(0),
		sourceRef: text("source_ref"),
		status: caseStatusEnum("status").notNull().default("draft"),
		steps: jsonb("steps")
			.$type<CaseStep[]>()
			.notNull()
			.default(sql`'[]'::jsonb`),
		tags: jsonb("tags").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(table) => [
		index("test_cases_module_id_sort_order_idx").on(
			table.moduleId,
			table.sortOrder
		),
		index("test_cases_project_id_status_idx").on(table.projectId, table.status),
		uniqueIndex("test_cases_project_id_source_ref_uq")
			.on(table.projectId, table.sourceRef)
			.where(sql`source_ref IS NOT NULL`),
	]
);

export type TestCase = typeof testCases.$inferSelect;
export type NewTestCase = typeof testCases.$inferInsert;

/**
 * Full content snapshot of a test case stored in case_versions.snapshot.
 * Captures every user-editable field so any version can be rendered,
 * diffed, and rolled back without joins.
 */
export interface CaseSnapshot {
	caseType: CaseType;
	maintainer: string | null;
	moduleId: string;
	name: string;
	preconditions: string | null;
	priority: CasePriority;
	sourceRef: string | null;
	status: CaseStatus;
	steps: CaseStep[];
	tags: string[];
}

export const caseVersions = pgTable(
	"case_versions",
	{
		caseId: uuid("case_id")
			.notNull()
			.references(() => testCases.id, { onDelete: "cascade" }),
		changeNote: text("change_note"),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		id: uuid("id").primaryKey().defaultRandom(),
		savedBy: text("saved_by"),
		snapshot: jsonb("snapshot").$type<CaseSnapshot>().notNull(),
		version: integer("version").notNull(),
	},
	(table) => [
		unique("case_versions_case_id_version_uq").on(table.caseId, table.version),
		index("case_versions_case_id_version_desc_idx").on(
			table.caseId,
			table.version.desc()
		),
	]
);

export type CaseVersion = typeof caseVersions.$inferSelect;
export type NewCaseVersion = typeof caseVersions.$inferInsert;

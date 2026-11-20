import {
	index,
	integer,
	pgEnum,
	pgTable,
	text,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core";

import { projects } from "./projects";
import { users } from "./users";

export const caseActivityActionEnum = pgEnum("case_activity_action", [
	"created",
	"updated",
	"deleted",
]);

export type CaseActivityAction =
	(typeof caseActivityActionEnum.enumValues)[number];

/**
 * 用例操作记录：谁在什么时候新建、修改或删除了哪条用例。与用例的写入在同一个事务中写入。
 * case_id 和 module_id 不是外键：用例或模块删除后，记录仍然保留，用例名称记在 case_name 中。
 * created_at 是事务开始的时间（now()），所以一次批量操作写入的记录有相同的 created_at。
 */
export const caseActivities = pgTable(
	"case_activities",
	{
		action: caseActivityActionEnum("action").notNull(),
		actorId: uuid("actor_id").references(() => users.id, {
			onDelete: "set null",
		}),
		actorName: text("actor_name"),
		caseId: uuid("case_id").notNull(),
		caseName: text("case_name").notNull(),
		changeNote: text("change_note"),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		id: uuid("id").primaryKey().defaultRandom(),
		moduleId: uuid("module_id").notNull(),
		projectId: uuid("project_id")
			.notNull()
			.references(() => projects.id, { onDelete: "cascade" }),
		/** 写入后的用例版本。删除时是删除前的版本。 */
		version: integer("version").notNull(),
	},
	(table) => [
		index("case_activities_project_id_created_at_desc_idx").on(
			table.projectId,
			table.createdAt.desc(),
			table.id.desc()
		),
	]
);

export type CaseActivity = typeof caseActivities.$inferSelect;
export type NewCaseActivity = typeof caseActivities.$inferInsert;

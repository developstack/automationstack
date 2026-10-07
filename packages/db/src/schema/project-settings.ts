import { sql } from "drizzle-orm";
import {
	check,
	integer,
	pgTable,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";

import {
	DEFAULT_AUTO_SUBMIT_AFTER_COMPLETED_DAYS,
	MAX_AUTO_SUBMIT_AFTER_COMPLETED_DAYS,
	MIN_AUTO_SUBMIT_AFTER_COMPLETED_DAYS,
} from "./project-settings-core";
import { projects } from "./projects";

// biome-ignore lint/performance/noBarrelFile: 三行具名 re-export，不是 `export *` 的桶文件——目的正相反：让「前端能 value-import」和「既有导入路径不变」同时成立，删掉它 apps/web 就得改
export {
	DEFAULT_AUTO_SUBMIT_AFTER_COMPLETED_DAYS,
	MAX_AUTO_SUBMIT_AFTER_COMPLETED_DAYS,
	MIN_AUTO_SUBMIT_AFTER_COMPLETED_DAYS,
} from "./project-settings-core";

export const projectSettings = pgTable(
	"project_settings",
	{
		autoSubmitAfterCompletedDays: integer("auto_submit_after_completed_days")
			.notNull()
			.default(DEFAULT_AUTO_SUBMIT_AFTER_COMPLETED_DAYS),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		id: uuid("id").primaryKey().defaultRandom(),
		projectId: uuid("project_id")
			.notNull()
			.references(() => projects.id, { onDelete: "cascade" }),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(table) => [
		uniqueIndex("project_settings_project_id_uq").on(table.projectId),
		check(
			"project_settings_auto_submit_days_range",
			sql`${table.autoSubmitAfterCompletedDays} between ${sql.raw(
				String(MIN_AUTO_SUBMIT_AFTER_COMPLETED_DAYS)
			)} and ${sql.raw(String(MAX_AUTO_SUBMIT_AFTER_COMPLETED_DAYS))}`
		),
	]
);

export type ProjectSettings = typeof projectSettings.$inferSelect;
export type NewProjectSettings = typeof projectSettings.$inferInsert;

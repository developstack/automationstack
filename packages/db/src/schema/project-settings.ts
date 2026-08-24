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

/**
 * 三个天数常量的定义在 `./project-settings-core.ts`——那个文件不 import drizzle，
 * 所以前端可以 value-import 它，不必再 `import type` + `typeof` 手抄一份 1/30。
 * 这里原样 re-export，既有的 `schema/project-settings` 导入路径保持不变。
 */
// biome-ignore lint/performance/noBarrelFile: 三行具名 re-export，不是 `export *` 的桶文件——目的正相反：让「前端能 value-import」和「既有导入路径不变」同时成立，删掉它 apps/web 就得改
export {
	DEFAULT_AUTO_SUBMIT_AFTER_COMPLETED_DAYS,
	MAX_AUTO_SUBMIT_AFTER_COMPLETED_DAYS,
	MIN_AUTO_SUBMIT_AFTER_COMPLETED_DAYS,
} from "./project-settings-core";

/**
 * 项目级设置，一个项目至多一行，**懒创建**（进过设置页并保存过才有行）。
 *
 * 与 `jira_configs` 分表而不是合并：那张表带 API Token 密文，生命周期、
 * 读写频率和权限面都不同——把密文和一个普通的天数配置放进同一行，
 * 意味着每次读天数都要把密文一起捞出来，任何一处忘记裁字段就是一次泄漏面。
 * 两者在 UI 上同属一个「项目设置」页，但那是展示问题，不是存储问题。
 */
export const projectSettings = pgTable(
	"project_settings",
	{
		/** 见 `DEFAULT_AUTO_SUBMIT_AFTER_COMPLETED_DAYS`；列默认值与它保持一致。 */
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
		// 「一个项目至多一行」落到数据库层，而不是靠应用代码先查再插：
		// 两个人同时保存设置会插出两行，之后读到哪一行就成了掷骰子。
		// 这个唯一索引同时也是 upsert 的 ON CONFLICT 目标。
		uniqueIndex("project_settings_project_id_uq").on(table.projectId),
		// 区间校验放数据库而不是只放 zod：种子脚本、将来的批量导入、以及任何
		// 直连库的修数操作都不经过 API 层，只有 CHECK 是所有写入路径都绕不过去的那道。
		// 用 sql.raw 而不是插值——插值会生成绑定参数占位符，CHECK 里放占位符非法。
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

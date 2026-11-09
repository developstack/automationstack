import { index, pgTable, timestamp, unique, uuid } from "drizzle-orm/pg-core";

import { projects } from "./projects";
import { users } from "./users";

/** 项目成员可以使用这个项目。项目内没有角色：只有管理员能管理项目（ADR 0008）。 */
export const projectMembers = pgTable(
	"project_members",
	{
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		id: uuid("id").primaryKey().defaultRandom(),
		projectId: uuid("project_id")
			.notNull()
			.references(() => projects.id, { onDelete: "cascade" }),
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
	},
	(table) => [
		unique("project_members_project_id_user_id_uq").on(
			table.projectId,
			table.userId
		),
		index("project_members_user_id_idx").on(table.userId),
	]
);

export type ProjectMember = typeof projectMembers.$inferSelect;
export type NewProjectMember = typeof projectMembers.$inferInsert;

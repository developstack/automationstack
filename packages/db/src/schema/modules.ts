import {
	type AnyPgColumn,
	index,
	integer,
	pgTable,
	text,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core";

import { projects } from "./projects";

export const modules = pgTable(
	"modules",
	{
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		id: uuid("id").primaryKey().defaultRandom(),
		name: text("name").notNull(),
		parentId: uuid("parent_id").references((): AnyPgColumn => modules.id, {
			onDelete: "cascade",
		}),
		projectId: uuid("project_id")
			.notNull()
			.references(() => projects.id, { onDelete: "cascade" }),
		sortOrder: integer("sort_order").notNull().default(0),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(table) => [
		index("modules_project_id_idx").on(table.projectId),
		index("modules_parent_id_sort_order_idx").on(
			table.parentId,
			table.sortOrder
		),
	]
);

export type Module = typeof modules.$inferSelect;
export type NewModule = typeof modules.$inferInsert;

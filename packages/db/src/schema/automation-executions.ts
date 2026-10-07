import {
	index,
	integer,
	jsonb,
	pgTable,
	text,
	timestamp,
	unique,
	uuid,
} from "drizzle-orm/pg-core";

import { projects } from "./projects";
import { users } from "./users";

export const automationExecutions = pgTable(
	"automation_executions",
	{
		branch: text("branch"),
		ciUrl: text("ci_url"),
		commitSha: text("commit_sha"),
		completedAt: timestamp("completed_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		finishedAt: timestamp("finished_at", { withTimezone: true }),
		id: uuid("id").primaryKey().defaultRandom(),
		idempotencyKey: text("idempotency_key").notNull(),
		projectId: uuid("project_id")
			.notNull()
			.references(() => projects.id, { onDelete: "cascade" }),
		receipt: jsonb("receipt"),
		reportedBy: uuid("reported_by").references(() => users.id, {
			onDelete: "set null",
		}),
		skippedCount: integer("skipped_count").notNull().default(0),
		startedAt: timestamp("started_at", { withTimezone: true }),
		updatedCount: integer("updated_count").notNull().default(0),
	},
	(table) => [
		unique("automation_executions_project_id_idempotency_key_uq").on(
			table.projectId,
			table.idempotencyKey
		),
		index("automation_executions_project_id_created_at_desc_idx").on(
			table.projectId,
			table.createdAt.desc()
		),
	]
);

export type AutomationExecution = typeof automationExecutions.$inferSelect;
export type NewAutomationExecution = typeof automationExecutions.$inferInsert;

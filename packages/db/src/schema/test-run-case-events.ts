import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { testRunCaseResultEnum, testRunCases } from "./test-runs";
import { users } from "./users";

export const testRunCaseEvents = pgTable(
	"test_run_case_events",
	{
		actorId: uuid("actor_id").references(() => users.id, {
			onDelete: "set null",
		}),
		comment: text("comment"),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		fromResult: testRunCaseResultEnum("from_result").notNull(),
		id: uuid("id").primaryKey().defaultRandom(),
		runCaseId: uuid("run_case_id")
			.notNull()
			.references(() => testRunCases.id, { onDelete: "cascade" }),
		toResult: testRunCaseResultEnum("to_result").notNull(),
	},
	(table) => [
		index("test_run_case_events_run_case_id_created_at_desc_idx").on(
			table.runCaseId,
			table.createdAt.desc()
		),
	]
);

export type TestRunCaseEvent = typeof testRunCaseEvents.$inferSelect;
export type NewTestRunCaseEvent = typeof testRunCaseEvents.$inferInsert;

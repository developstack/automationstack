import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { testRunExecutedViaEnum } from "./test-run-enums";
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
		/** 判定的方式：手动或自动化回写。改回未测时为空。迁移 0027 之前的自动化判定可能记为手动。 */
		executedVia: testRunExecutedViaEnum("executed_via"),
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
		index("test_run_case_events_created_at_idx").on(table.createdAt),
	]
);

export type TestRunCaseEvent = typeof testRunCaseEvents.$inferSelect;
export type NewTestRunCaseEvent = typeof testRunCaseEvents.$inferInsert;

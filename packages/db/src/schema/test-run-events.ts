import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { testRunStatusEnum, testRuns } from "./test-runs";
import { users } from "./users";

export const testRunEvents = pgTable(
	"test_run_events",
	{
		actorId: uuid("actor_id").references(() => users.id, {
			onDelete: "set null",
		}),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		fromStatus: testRunStatusEnum("from_status"),
		id: uuid("id").primaryKey().defaultRandom(),
		reason: text("reason"),
		runId: uuid("run_id")
			.notNull()
			.references(() => testRuns.id, { onDelete: "cascade" }),
		toStatus: testRunStatusEnum("to_status").notNull(),
	},
	(table) => [
		index("test_run_events_run_id_created_at_desc_idx").on(
			table.runId,
			table.createdAt.desc()
		),
	]
);

export type TestRunEvent = typeof testRunEvents.$inferSelect;
export type NewTestRunEvent = typeof testRunEvents.$inferInsert;

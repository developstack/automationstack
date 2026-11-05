import {
	index,
	integer,
	pgTable,
	text,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core";

import {
	testRunAttachmentKindEnum,
	testRunCases,
	testRunExecutedViaEnum,
} from "./test-runs";
import { users } from "./users";

export const testRunAttachments = pgTable(
	"test_run_attachments",
	{
		contentType: text("content_type").notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		createdBy: uuid("created_by").references(() => users.id, {
			onDelete: "set null",
		}),
		fileName: text("file_name").notNull(),
		id: uuid("id").primaryKey().defaultRandom(),
		kind: testRunAttachmentKindEnum("kind").notNull().default("screenshot"),
		runCaseId: uuid("run_case_id")
			.notNull()
			.references(() => testRunCases.id, { onDelete: "cascade" }),
		sizeBytes: integer("size_bytes").notNull(),
		/**
		 * 实际附件所属的步骤 id（见 CONTEXT.md）。null 表示附件挂在整条用例上：
		 * 自动化上传的附件，以及以前人工上传的整条用例的附件。
		 */
		stepId: text("step_id"),
		storageKey: text("storage_key").notNull(),
		uploadedVia: testRunExecutedViaEnum("uploaded_via"),
	},
	(table) => [index("test_run_attachments_run_case_id_idx").on(table.runCaseId)]
);

export type TestRunAttachment = typeof testRunAttachments.$inferSelect;
export type NewTestRunAttachment = typeof testRunAttachments.$inferInsert;

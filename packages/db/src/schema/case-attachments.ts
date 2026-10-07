import {
	index,
	integer,
	pgTable,
	text,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core";

import { testCases } from "./test-cases";
import { users } from "./users";

export const caseAttachments = pgTable(
	"case_attachments",
	{
		caseId: uuid("case_id")
			.notNull()
			.references(() => testCases.id, { onDelete: "cascade" }),
		contentType: text("content_type").notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		createdBy: uuid("created_by").references(() => users.id, {
			onDelete: "set null",
		}),
		fileName: text("file_name").notNull(),
		id: uuid("id").primaryKey().defaultRandom(),
		sizeBytes: integer("size_bytes").notNull(),
		storageKey: text("storage_key").notNull(),
	},
	(table) => [index("case_attachments_case_id_idx").on(table.caseId)]
);

export type CaseAttachment = typeof caseAttachments.$inferSelect;
export type NewCaseAttachment = typeof caseAttachments.$inferInsert;

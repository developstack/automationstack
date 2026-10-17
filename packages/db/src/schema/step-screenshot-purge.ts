import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * 迁移 0019 删除的步骤截图附件（ADR 0005）。迁移删除附件记录前，把它们的对象键复制到这张表。
 * R2 清理脚本只删除这张表中的对象，删除成功后移除对应的行。清理完成后，以后的迁移删除这张表。
 * 这张表没有外键，因为它引用的附件记录已经删除。
 */
export const stepScreenshotPurge = pgTable("step_screenshot_purge", {
	attachmentId: uuid("attachment_id").primaryKey(),
	queuedAt: timestamp("queued_at", { withTimezone: true })
		.notNull()
		.defaultNow(),
	storageKey: text("storage_key").notNull(),
});

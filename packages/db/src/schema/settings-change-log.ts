import { jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { users } from "./users";

/** 修改记录中的一个字段。密钥只记录「已修改」或「已清空」，不记录值。 */
export interface ChangedSettingsField {
	change: "changed" | "cleared";
	field: string;
}

export const settingsChangeLog = pgTable("settings_change_log", {
	actorId: uuid("actor_id").references(() => users.id, {
		onDelete: "set null",
	}),
	at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
	changedFields: jsonb("changed_fields")
		.$type<ChangedSettingsField[]>()
		.notNull(),
	id: uuid("id").primaryKey().defaultRandom(),
	settingsKey: text("settings_key").notNull(),
});

export type SettingsChangeLogRow = typeof settingsChangeLog.$inferSelect;

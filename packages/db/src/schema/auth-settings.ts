import { DEFAULT_CASDOOR_PROJECT_ADMIN_ROLE } from "@automationstack/env/casdoor-rules";
import { sql } from "drizzle-orm";
import {
	check,
	integer,
	jsonb,
	pgEnum,
	pgTable,
	text,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core";

import { users } from "./users";

export const authProviderEnum = pgEnum("auth_provider", ["local", "casdoor"]);

export type AuthProviderId = (typeof authProviderEnum.enumValues)[number];

/** 认证设置只有一行，id 固定为 1。没有这一行时，认证设置取环境变量。 */
export const AUTH_SETTINGS_ROW_ID = 1;

export const authSettings = pgTable(
	"auth_settings",
	{
		adminRole: text("admin_role"),
		clientId: text("client_id"),
		clientSecretCipher: text("client_secret_cipher"),
		id: integer("id").primaryKey().default(AUTH_SETTINGS_ROW_ID),
		issuer: text("issuer"),
		lastTestOkAt: timestamp("last_test_ok_at", { withTimezone: true }),
		organization: text("organization"),
		/** Casdoor 中的项目管理员角色名（#15）。已有的行取默认值。 */
		projectAdminRole: text("project_admin_role").default(
			DEFAULT_CASDOOR_PROJECT_ADMIN_ROLE
		),
		provider: authProviderEnum("provider").notNull().default("local"),
		redirectUrl: text("redirect_url"),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedBy: uuid("updated_by").references(() => users.id, {
			onDelete: "set null",
		}),
		webhookSecretCipher: text("webhook_secret_cipher"),
	},
	(table) => [check("auth_settings_single_row", sql`${table.id} = 1`)]
);

export type AuthSettingsRow = typeof authSettings.$inferSelect;

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

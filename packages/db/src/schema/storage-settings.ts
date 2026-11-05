import { sql } from "drizzle-orm";
import {
	check,
	integer,
	pgEnum,
	pgTable,
	text,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core";

import { users } from "./users";

/** local：文件写在 server 的本地目录中。r2：文件写在 Cloudflare R2 中。 */
export const storageBackendEnum = pgEnum("storage_backend", ["local", "r2"]);

export type StorageBackendId = (typeof storageBackendEnum.enumValues)[number];

/** 存储设置只有一行，id 固定为 1。没有这一行时，存储设置取环境变量。 */
export const STORAGE_SETTINGS_ROW_ID = 1;

export const storageSettings = pgTable(
	"storage_settings",
	{
		backend: storageBackendEnum("backend").notNull().default("local"),
		id: integer("id").primaryKey().default(STORAGE_SETTINGS_ROW_ID),
		/** R2 中用例图片的公开基础地址，例如 https://img.trendf.top（ADR-0003）。 */
		publicBaseUrl: text("public_base_url"),
		r2AccessKeyId: text("r2_access_key_id"),
		r2Bucket: text("r2_bucket"),
		r2Endpoint: text("r2_endpoint"),
		r2SecretAccessKeyCipher: text("r2_secret_access_key_cipher"),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedBy: uuid("updated_by").references(() => users.id, {
			onDelete: "set null",
		}),
	},
	(table) => [check("storage_settings_single_row", sql`${table.id} = 1`)]
);

export type StorageSettingsRow = typeof storageSettings.$inferSelect;

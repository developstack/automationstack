import {
	index,
	pgTable,
	text,
	timestamp,
	unique,
	uuid,
} from "drizzle-orm/pg-core";

import { users } from "./users";

export const apiTokens = pgTable(
	"api_tokens",
	{
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		id: uuid("id").primaryKey().defaultRandom(),
		lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
		name: text("name").notNull(),
		prefix: text("prefix").notNull(),
		revokedAt: timestamp("revoked_at", { withTimezone: true }),
		tokenHash: text("token_hash").notNull(),
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
	},
	(table) => [
		unique("api_tokens_token_hash_uq").on(table.tokenHash),
		index("api_tokens_user_id_created_at_desc_idx").on(
			table.userId,
			table.createdAt.desc()
		),
	]
);

export type ApiToken = typeof apiTokens.$inferSelect;
export type NewApiToken = typeof apiTokens.$inferInsert;

export interface ApiTokenView {
	createdAt: Date;
	id: string;
	lastUsedAt: Date | null;
	name: string;
	prefix: string;
	revokedAt: Date | null;
}

export function toApiTokenView(row: ApiToken): ApiTokenView {
	return {
		createdAt: row.createdAt,
		id: row.id,
		lastUsedAt: row.lastUsedAt,
		name: row.name,
		prefix: row.prefix,
		revokedAt: row.revokedAt,
	};
}

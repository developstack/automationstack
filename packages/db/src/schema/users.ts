import { pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const userRoleEnum = pgEnum("user_role", ["admin", "member"]);

export type UserRole = (typeof userRoleEnum.enumValues)[number];

export const users = pgTable("users", {
	createdAt: timestamp("created_at", { withTimezone: true })
		.notNull()
		.defaultNow(),
	disabledAt: timestamp("disabled_at", { withTimezone: true }),
	id: uuid("id").primaryKey().defaultRandom(),
	passwordHash: text("password_hash").notNull(),
	role: userRoleEnum("role").notNull().default("member"),
	updatedAt: timestamp("updated_at", { withTimezone: true })
		.notNull()
		.defaultNow()
		.$onUpdate(() => new Date()),
	username: text("username").notNull().unique(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export interface PublicUser {
	createdAt: Date;
	disabledAt: Date | null;
	id: string;
	role: UserRole;
	username: string;
}

export function toPublicUser(user: User): PublicUser {
	return {
		createdAt: user.createdAt,
		disabledAt: user.disabledAt,
		id: user.id,
		role: user.role,
		username: user.username,
	};
}

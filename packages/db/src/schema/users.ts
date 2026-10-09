import {
	boolean,
	pgEnum,
	pgTable,
	text,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core";

export const userRoleEnum = pgEnum("user_role", ["admin", "member"]);

export type UserRole = (typeof userRoleEnum.enumValues)[number];

export const authSourceEnum = pgEnum("auth_source", ["local", "casdoor"]);

export type AuthSource = (typeof authSourceEnum.enumValues)[number];

export const users = pgTable("users", {
	authSource: authSourceEnum("auth_source").notNull().default("local"),
	createdAt: timestamp("created_at", { withTimezone: true })
		.notNull()
		.defaultNow(),
	disabledAt: timestamp("disabled_at", { withTimezone: true }),
	externalId: text("external_id").unique(),
	id: uuid("id").primaryKey().defaultRandom(),
	mustChangePassword: boolean("must_change_password").notNull().default(false),
	passwordHash: text("password_hash"),
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
	authSource: AuthSource;
	createdAt: Date;
	disabledAt: Date | null;
	id: string;
	mustChangePassword: boolean;
	role: UserRole;
	username: string;
}

export function toPublicUser(user: User): PublicUser {
	return {
		authSource: user.authSource,
		createdAt: user.createdAt,
		disabledAt: user.disabledAt,
		id: user.id,
		mustChangePassword: user.mustChangePassword,
		role: user.role,
		username: user.username,
	};
}

import {
	boolean,
	pgEnum,
	pgTable,
	text,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core";

/**
 * 平台角色：admin 是管理员，member 是普通用户（ADR 0008）。
 * 只有管理员能创建项目、管理用户和项目成员。
 */
export const userRoleEnum = pgEnum("user_role", ["admin", "member"]);

export type UserRole = (typeof userRoleEnum.enumValues)[number];

export const users = pgTable("users", {
	createdAt: timestamp("created_at", { withTimezone: true })
		.notNull()
		.defaultNow(),
	disabledAt: timestamp("disabled_at", { withTimezone: true }),
	/** 以前 Casdoor 账号的 id。现在不再使用，删除这一列之前必须得到确认（ADR 0008）。 */
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
	createdAt: Date;
	disabledAt: Date | null;
	/** 账号是否设置了本地密码。以前的 Casdoor 账号没有密码，重置密码后才能登录。 */
	hasPassword: boolean;
	id: string;
	mustChangePassword: boolean;
	role: UserRole;
	username: string;
}

export function toPublicUser(user: User): PublicUser {
	return {
		createdAt: user.createdAt,
		disabledAt: user.disabledAt,
		hasPassword: user.passwordHash !== null,
		id: user.id,
		mustChangePassword: user.mustChangePassword,
		role: user.role,
		username: user.username,
	};
}

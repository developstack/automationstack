import { pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * 两档权限（用户选定「管理员创建账号」模式）：
 * - `admin`：额外可进「成员管理」，创建 / 停用 / 重置成员账号
 * - `member`：项目、模块、用例全部可读可写，与 admin 无差别
 * 项目级授权不在本期范围内——所有登录用户看到同一批项目。
 */
export const userRoleEnum = pgEnum("user_role", ["admin", "member"]);

export type UserRole = (typeof userRoleEnum.enumValues)[number];

export const users = pgTable("users", {
	createdAt: timestamp("created_at", { withTimezone: true })
		.notNull()
		.defaultNow(),
	/**
	 * 停用而不是删除：用例的 last_modified_by / saved_by 存的是当时的用户名
	 * 快照文本，删账号不会让历史记录失去署名，但重建同名账号会让旧记录看起来
	 * 像是新人干的。停用保留用户名占位，登录时直接拒绝。
	 */
	disabledAt: timestamp("disabled_at", { withTimezone: true }),
	id: uuid("id").primaryKey().defaultRandom(),
	/** `packages/db/src/password.ts` 的自描述串，绝不存明文。 */
	passwordHash: text("password_hash").notNull(),
	role: userRoleEnum("role").notNull().default("member"),
	updatedAt: timestamp("updated_at", { withTimezone: true })
		.notNull()
		.defaultNow()
		.$onUpdate(() => new Date()),
	/**
	 * 登录标识，同时也是界面上直接展示的名字（不再有单独的协作昵称）。
	 * 唯一约束是大小写敏感的：账号由管理员统一创建，不存在自助注册那种
	 * 「Alice 抢注 alice」的对抗场景，API 层只做 trim。
	 */
	username: text("username").notNull().unique(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

/** 可以安全下发到前端的用户字段（永远不含 passwordHash）。 */
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

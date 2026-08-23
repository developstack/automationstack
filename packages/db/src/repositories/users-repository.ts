import { asc, eq, sql } from "drizzle-orm";

import { db } from "../index";
import { type User, type UserRole, users } from "../schema/users";

export interface CreateUserInput {
	passwordHash: string;
	role?: UserRole;
	username: string;
}

export function listUsers(): Promise<User[]> {
	return db.select().from(users).orderBy(asc(users.createdAt));
}

export async function getUserById(id: string): Promise<User | null> {
	const [row] = await db.select().from(users).where(eq(users.id, id)).limit(1);
	return row ?? null;
}

export async function getUserByUsername(
	username: string
): Promise<User | null> {
	const [row] = await db
		.select()
		.from(users)
		.where(eq(users.username, username))
		.limit(1);
	return row ?? null;
}

/**
 * 创建账号；用户名已被占用时返回 null 而不是抛错。
 * `onConflictDoNothing` 让「查重 + 插入」并成一条语句，两个管理员同时提交
 * 同一个用户名时由唯一约束仲裁，不会出现先查后插之间的竞态窗口。
 */
export async function createUser(input: CreateUserInput): Promise<User | null> {
	const [row] = await db
		.insert(users)
		.values({
			passwordHash: input.passwordHash,
			role: input.role ?? "member",
			username: input.username,
		})
		.onConflictDoNothing({ target: users.username })
		.returning();
	return row ?? null;
}

export async function updateUserPasswordHash(
	id: string,
	passwordHash: string
): Promise<boolean> {
	const rows = await db
		.update(users)
		.set({ passwordHash })
		.where(eq(users.id, id))
		.returning({ id: users.id });
	return rows.length > 0;
}

export async function updateUserRole(
	id: string,
	role: UserRole
): Promise<User | null> {
	const [row] = await db
		.update(users)
		.set({ role })
		.where(eq(users.id, id))
		.returning();
	return row ?? null;
}

/** 停用 / 恢复账号。停用后已签发的会话在下一次请求时即失效。 */
export async function setUserDisabled(
	id: string,
	disabled: boolean
): Promise<User | null> {
	const [row] = await db
		.update(users)
		.set({ disabledAt: disabled ? new Date() : null })
		.where(eq(users.id, id))
		.returning();
	return row ?? null;
}

/**
 * 仍然启用的管理员人数。用于拦「把最后一个管理员降级 / 停用」——
 * 那会让系统再也没人能进成员管理，只能连数据库手改。
 */
export async function countActiveAdmins(): Promise<number> {
	const [row] = await db
		.select({ value: sql<number>`count(*)::int` })
		.from(users)
		.where(sql`${users.role} = 'admin' and ${users.disabledAt} is null`);
	return row?.value ?? 0;
}

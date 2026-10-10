import { and, asc, eq } from "drizzle-orm";

import { db } from "../index";
import { type User, type UserRole, users } from "../schema/users";

export interface NewCasdoorUser {
	externalId: string;
	role: UserRole;
	username: string;
}

/**
 * 创建 Casdoor 用户的本地影子行（plan 021 D6）。没有本地密码。
 * 用户名或 external_id 已存在时不创建，返回 null。
 */
export async function createCasdoorUser(
	input: NewCasdoorUser
): Promise<User | null> {
	const [row] = await db
		.insert(users)
		.values({
			authSource: "casdoor",
			externalId: input.externalId,
			passwordHash: null,
			role: input.role,
			username: input.username,
		})
		.onConflictDoNothing()
		.returning();
	return row ?? null;
}

export interface CasdoorUserChanges {
	disabledAt?: Date | null;
	role?: UserRole;
	username?: string;
}

/**
 * 修改 Casdoor 用户的同步字段。条件中有 auth_source = casdoor，
 * 所以这个函数不会修改本地用户。行不存在或不是 Casdoor 用户时返回 null。
 */
export async function updateCasdoorUser(
	id: string,
	changes: CasdoorUserChanges
): Promise<User | null> {
	const [row] = await db
		.update(users)
		.set(changes)
		.where(and(eq(users.id, id), eq(users.authSource, "casdoor")))
		.returning();
	return row ?? null;
}

export type CasdoorShadowUser = Pick<
	User,
	"disabledAt" | "externalId" | "id" | "role" | "username"
>;

/** 全部 Casdoor 用户的同步字段。对账使用。 */
export function listCasdoorUsers(): Promise<CasdoorShadowUser[]> {
	return db
		.select({
			disabledAt: users.disabledAt,
			externalId: users.externalId,
			id: users.id,
			role: users.role,
			username: users.username,
		})
		.from(users)
		.where(eq(users.authSource, "casdoor"))
		.orderBy(asc(users.createdAt));
}

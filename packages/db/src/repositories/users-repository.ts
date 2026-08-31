import { asc, eq, sql } from "drizzle-orm";

import { db } from "../index";
import { projectMembers } from "../schema/project-members";
import { projects } from "../schema/projects";
import { type User, type UserRole, users } from "../schema/users";
import {
	groupUsersWithProjects,
	type UserWithProjects,
} from "./users-with-projects-core";

export interface CreateUserInput {
	passwordHash: string;
	role?: UserRole;
	username: string;
}

export function listUsers(): Promise<User[]> {
	return db.select().from(users).orderBy(asc(users.createdAt));
}

/**
 * 全部用户 + 每个人所属的全部项目（平台 `/users` 页那张平铺表）。
 *
 * **为什么放在 users-repository 而不是 project-members-repository**：它确实跨了
 * 两张表，但结果的行集与顺序完全由 users 定义——这就是 `listUsers()` 多带一列，
 * 一个项目都没有的人也必须在（他们是界面上「所属项目」显示「—」的那些人，
 * `leftJoin` 就是为他们写的）。project-members 那边每一条查询的主语都是某个
 * projectId 或某条成员关系，把这条挪过去会让「用户全表」的定义散到两个文件。
 *
 * 用户字段只取 `PublicUser` 那五列，而不是 `select()` 整行再删：`passwordHash`
 * 根本不进结果集，将来给 users 加敏感列也不会顺带流出来。
 *
 * 排序：用户 `createdAt asc`，与 `listUsers()` 一字不差（同一张表两个入口给出
 * 不同顺序是纯粹的坑）；每个人内部的项目按**名字**排——这一列在界面上就是一串
 * 项目名，人是照着名字扫的，createdAt 对读者不可见。项目名没有唯一约束，所以
 * 再用 id 兜一个全序，免得两个同名项目的相对位置每次查询都可能不一样。
 * 归并（笛卡尔展开 → 一人一行）在 `users-with-projects-core.ts`，那里能单测。
 */
export async function listUsersWithProjects(): Promise<UserWithProjects[]> {
	const rows = await db
		.select({
			projectId: projects.id,
			projectName: projects.name,
			projectRole: projectMembers.role,
			user: {
				createdAt: users.createdAt,
				disabledAt: users.disabledAt,
				id: users.id,
				role: users.role,
				username: users.username,
			},
		})
		.from(users)
		.leftJoin(projectMembers, eq(projectMembers.userId, users.id))
		.leftJoin(projects, eq(projects.id, projectMembers.projectId))
		.orderBy(asc(users.createdAt), asc(projects.name), asc(projects.id));
	return groupUsersWithProjects(rows);
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

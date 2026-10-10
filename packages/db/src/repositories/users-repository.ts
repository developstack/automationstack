import { and, asc, eq, isNotNull, isNull, sql } from "drizzle-orm";

import { db } from "../index";
import { projectMembers } from "../schema/project-members";
import { projects } from "../schema/projects";
import { type User, type UserRole, users } from "../schema/users";
import {
	groupUsersWithProjects,
	type UserWithProjects,
} from "./users-with-projects-core";

export interface CreateUserInput {
	mustChangePassword?: boolean;
	passwordHash: string;
	role?: UserRole;
	username: string;
}

export function listUsers(): Promise<User[]> {
	return db.select().from(users).orderBy(asc(users.createdAt));
}

export async function listUsersWithProjects(): Promise<UserWithProjects[]> {
	const rows = await db
		.select({
			projectId: projects.id,
			projectName: projects.name,
			projectRole: projectMembers.role,
			user: {
				authSource: users.authSource,
				createdAt: users.createdAt,
				disabledAt: users.disabledAt,
				id: users.id,
				mustChangePassword: users.mustChangePassword,
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

export async function createUser(input: CreateUserInput): Promise<User | null> {
	const [row] = await db
		.insert(users)
		.values({
			mustChangePassword: input.mustChangePassword ?? false,
			passwordHash: input.passwordHash,
			role: input.role ?? "member",
			username: input.username,
		})
		.onConflictDoNothing({ target: users.username })
		.returning();
	return row ?? null;
}

export async function getUserByExternalId(
	externalId: string
): Promise<User | null> {
	const [row] = await db
		.select()
		.from(users)
		.where(eq(users.externalId, externalId))
		.limit(1);
	return row ?? null;
}

export async function updateUserPasswordHash(
	id: string,
	passwordHash: string,
	mustChangePassword: boolean
): Promise<boolean> {
	const rows = await db
		.update(users)
		.set({ mustChangePassword, passwordHash })
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

export async function setMustChangePassword(
	id: string,
	mustChangePassword: boolean
): Promise<boolean> {
	const rows = await db
		.update(users)
		.set({ mustChangePassword })
		.where(eq(users.id, id))
		.returning({ id: users.id });
	return rows.length > 0;
}

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

export async function countActiveAdmins(): Promise<number> {
	const [row] = await db
		.select({ value: sql<number>`count(*)::int` })
		.from(users)
		.where(sql`${users.role} = 'admin' and ${users.disabledAt} is null`);
	return row?.value ?? 0;
}

export async function countLocalLoginAdmins(): Promise<number> {
	const [row] = await db
		.select({ value: sql<number>`count(*)::int` })
		.from(users)
		.where(
			and(
				eq(users.role, "admin"),
				isNull(users.disabledAt),
				isNotNull(users.passwordHash),
				eq(users.authSource, "local")
			)
		);
	return row?.value ?? 0;
}

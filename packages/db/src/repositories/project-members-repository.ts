import { and, asc, eq, isNull, notExists, sql } from "drizzle-orm";

import { db } from "../index";
import {
	type ProjectMember,
	type ProjectRole,
	projectMembers,
} from "../schema/project-members";
import { type Project, projects } from "../schema/projects";
import { users } from "../schema/users";
import {
	type CreateProjectInput,
	createProjectInTx,
} from "./projects-repository";

export interface ProjectMemberView {
	createdAt: Date;
	disabledAt: Date | null;
	role: ProjectRole;
	userId: string;
	username: string;
}

export interface AddProjectMemberInput {
	projectId: string;
	role?: ProjectRole;
	userId: string;
}

export function listProjectMembers(
	projectId: string
): Promise<ProjectMemberView[]> {
	return db
		.select({
			createdAt: projectMembers.createdAt,
			disabledAt: users.disabledAt,
			role: projectMembers.role,
			userId: users.id,
			username: users.username,
		})
		.from(projectMembers)
		.innerJoin(users, eq(users.id, projectMembers.userId))
		.where(eq(projectMembers.projectId, projectId))
		.orderBy(asc(projectMembers.createdAt));
}

export interface ProjectMemberCandidate {
	id: string;
	username: string;
}

export function listProjectMemberCandidates(
	projectId: string
): Promise<ProjectMemberCandidate[]> {
	return db
		.select({ id: users.id, username: users.username })
		.from(users)
		.where(
			and(
				isNull(users.disabledAt),
				notExists(
					db
						.select({ one: sql`1` })
						.from(projectMembers)
						.where(
							and(
								eq(projectMembers.projectId, projectId),
								eq(projectMembers.userId, users.id)
							)
						)
				)
			)
		)
		.orderBy(asc(users.username));
}

export async function getProjectRole(
	projectId: string,
	userId: string
): Promise<ProjectRole | null> {
	const [row] = await db
		.select({ role: projectMembers.role })
		.from(projectMembers)
		.where(
			and(
				eq(projectMembers.projectId, projectId),
				eq(projectMembers.userId, userId)
			)
		)
		.limit(1);
	return row?.role ?? null;
}

export function listProjectsByMember(userId: string): Promise<Project[]> {
	return db
		.select({
			createdAt: projects.createdAt,
			description: projects.description,
			id: projects.id,
			name: projects.name,
			updatedAt: projects.updatedAt,
		})
		.from(projectMembers)
		.innerJoin(projects, eq(projects.id, projectMembers.projectId))
		.where(eq(projectMembers.userId, userId))
		.orderBy(asc(projects.createdAt));
}

export async function addProjectMember(
	input: AddProjectMemberInput
): Promise<ProjectMember | null> {
	const [row] = await db
		.insert(projectMembers)
		.values({
			projectId: input.projectId,
			role: input.role ?? "member",
			userId: input.userId,
		})
		.onConflictDoNothing({
			target: [projectMembers.projectId, projectMembers.userId],
		})
		.returning();
	return row ?? null;
}

export async function updateProjectMemberRole(
	projectId: string,
	userId: string,
	role: ProjectRole
): Promise<ProjectMember | null> {
	const [row] = await db
		.update(projectMembers)
		.set({ role })
		.where(
			and(
				eq(projectMembers.projectId, projectId),
				eq(projectMembers.userId, userId)
			)
		)
		.returning();
	return row ?? null;
}

export async function removeProjectMember(
	projectId: string,
	userId: string
): Promise<boolean> {
	const rows = await db
		.delete(projectMembers)
		.where(
			and(
				eq(projectMembers.projectId, projectId),
				eq(projectMembers.userId, userId)
			)
		)
		.returning({ id: projectMembers.id });
	return rows.length > 0;
}

export async function countProjectOwners(projectId: string): Promise<number> {
	const [row] = await db
		.select({ value: sql<number>`count(*)::int` })
		.from(projectMembers)
		.where(
			and(
				eq(projectMembers.projectId, projectId),
				eq(projectMembers.role, "owner")
			)
		);
	return row?.value ?? 0;
}

export function createProjectWithOwner(
	input: CreateProjectInput,
	ownerUserId: string
): Promise<Project> {
	return db.transaction(async (tx) => {
		const project = await createProjectInTx(tx, input);
		await tx
			.insert(projectMembers)
			.values({ projectId: project.id, role: "owner", userId: ownerUserId });
		return project;
	});
}

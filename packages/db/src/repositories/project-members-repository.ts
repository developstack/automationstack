import { and, asc, eq, isNull, notExists, sql } from "drizzle-orm";

import { db } from "../index";
import { type ProjectMember, projectMembers } from "../schema/project-members";
import { type Project, projects } from "../schema/projects";
import { type UserRole, users } from "../schema/users";
import {
	type CreateProjectInput,
	createProjectInTx,
} from "./projects-repository";

export interface ProjectMemberView {
	createdAt: Date;
	disabledAt: Date | null;
	/** 平台角色。web 用它标出管理员。 */
	platformRole: UserRole;
	userId: string;
	username: string;
}

export interface AddProjectMemberInput {
	projectId: string;
	userId: string;
}

export function listProjectMembers(
	projectId: string
): Promise<ProjectMemberView[]> {
	return db
		.select({
			createdAt: projectMembers.createdAt,
			disabledAt: users.disabledAt,
			platformRole: users.role,
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
		.select({
			id: users.id,
			username: users.username,
		})
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

/** 用户是否是项目成员。 */
export async function isProjectMember(
	projectId: string,
	userId: string
): Promise<boolean> {
	const [row] = await db
		.select({ id: projectMembers.id })
		.from(projectMembers)
		.where(
			and(
				eq(projectMembers.projectId, projectId),
				eq(projectMembers.userId, userId)
			)
		)
		.limit(1);
	return row !== undefined;
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
			userId: input.userId,
		})
		.onConflictDoNothing({
			target: [projectMembers.projectId, projectMembers.userId],
		})
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

/** 创建项目，并把创建者加为项目成员。 */
export function createProjectWithCreator(
	input: CreateProjectInput,
	creatorUserId: string
): Promise<Project> {
	return db.transaction(async (tx) => {
		const project = await createProjectInTx(tx, input);
		await tx
			.insert(projectMembers)
			.values({ projectId: project.id, userId: creatorUserId });
		return project;
	});
}

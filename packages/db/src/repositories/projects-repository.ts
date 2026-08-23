import { asc, eq } from "drizzle-orm";

import { db } from "../index";
import { type Project, projects } from "../schema/projects";

export interface CreateProjectInput {
	description?: string | null;
	name: string;
}

export interface UpdateProjectInput {
	description?: string | null;
	name?: string;
}

export function listProjects(): Promise<Project[]> {
	return db.select().from(projects).orderBy(asc(projects.createdAt));
}

export async function getProjectById(id: string): Promise<Project | null> {
	const [row] = await db
		.select()
		.from(projects)
		.where(eq(projects.id, id))
		.limit(1);
	return row ?? null;
}

/** 按名称精确匹配最早创建的项目（种子脚本据此做幂等）。 */
export async function getProjectByName(name: string): Promise<Project | null> {
	const [row] = await db
		.select()
		.from(projects)
		.where(eq(projects.name, name))
		.orderBy(asc(projects.createdAt))
		.limit(1);
	return row ?? null;
}

export async function createProject(
	input: CreateProjectInput
): Promise<Project> {
	const [row] = await db
		.insert(projects)
		.values({ description: input.description ?? null, name: input.name })
		.returning();
	if (!row) {
		throw new Error("createProject: insert returned no row");
	}
	return row;
}

export async function updateProject(
	id: string,
	patch: UpdateProjectInput
): Promise<Project | null> {
	const set: UpdateProjectInput = {};
	if (patch.name !== undefined) {
		set.name = patch.name;
	}
	if (patch.description !== undefined) {
		set.description = patch.description;
	}
	if (Object.keys(set).length === 0) {
		return getProjectById(id);
	}
	const [row] = await db
		.update(projects)
		.set(set)
		.where(eq(projects.id, id))
		.returning();
	return row ?? null;
}

export async function removeProject(id: string): Promise<boolean> {
	const rows = await db
		.delete(projects)
		.where(eq(projects.id, id))
		.returning({ id: projects.id });
	return rows.length > 0;
}

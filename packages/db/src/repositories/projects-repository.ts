import { asc, eq } from "drizzle-orm";

import { db } from "../index";
import { type Project, projects } from "../schema/projects";
import { testRuns } from "../schema/test-runs";
import type { DbTransaction } from "./repository-types";

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

export async function getProjectByName(name: string): Promise<Project | null> {
	const [row] = await db
		.select()
		.from(projects)
		.where(eq(projects.name, name))
		.orderBy(asc(projects.createdAt))
		.limit(1);
	return row ?? null;
}

export async function createProjectInTx(
	tx: DbTransaction,
	input: CreateProjectInput
): Promise<Project> {
	const [row] = await tx
		.insert(projects)
		.values({ description: input.description ?? null, name: input.name })
		.returning();
	if (!row) {
		throw new Error("createProjectInTx: insert returned no row");
	}
	return row;
}

export function createProject(input: CreateProjectInput): Promise<Project> {
	return db.transaction((tx) => createProjectInTx(tx, input));
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

export function removeProject(id: string): Promise<boolean> {
	return db.transaction(async (tx) => {
		await tx.delete(testRuns).where(eq(testRuns.projectId, id));
		const rows = await tx
			.delete(projects)
			.where(eq(projects.id, id))
			.returning({ id: projects.id });
		return rows.length > 0;
	});
}

export async function projectExists(id: string): Promise<boolean> {
	const [row] = await db
		.select({ id: projects.id })
		.from(projects)
		.where(eq(projects.id, id))
		.limit(1);
	return row !== undefined;
}

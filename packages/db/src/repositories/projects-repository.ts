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

/**
 * 建项目的插入语句本体。导出成 `*InTx` 是因为它有一个跨 repository 的组合方：
 * `project-members-repository.createProjectWithOwner` 要在同一个事务里顺手写下
 * owner 那一行（少了它，新项目对创建者自己都不可见）。
 */
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

/**
 * 不带成员的建项目。**只剩种子脚本在用**——API 走
 * `createProjectWithOwner`，因为经界面建的项目必须有 owner 才进得去。
 */
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

/**
 * 删项目，连同它的模块、用例、测试任务一并删除。
 *
 * 必须**先删测试任务**再删项目，且在同一事务里：`test_run_cases.caseId` 是
 * `onDelete: restrict`（plan §3.4），而 restrict 会拦下经由
 * `projects → modules → test_cases` 这条级联链传来的删除，
 * 于是直接 `delete from projects` 会抛一个裸的外键违约异常。
 * 删掉 `test_runs` 后，`test_run_cases` / `test_run_attachments` /
 * `test_run_events` 各自 cascade 消失，用例就不再被引用了。
 *
 * 这里不套用「被引用就拒绝」那套（那是删**单条用例**的策略）：用户明确要删的是
 * 整个项目，报告随项目一起消失是预期内的；而删一条用例时，用户想留下的恰恰是
 * 那些历史报告。同一个外键，两种入口，策略本就该不同。
 */
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

/**
 * 项目是否存在。**只回一个布尔，不回整行。**
 *
 * 唯一的调用方是草稿态贴图的 presign（`routers/case-attachment-drafts.ts`）：
 * 那条路径上 `projectId` 完全由客户端提供，而它只需要「这个 id 不是随手编的」
 * 这一个事实——用来拒绝把对象写到一个不存在的项目前缀下，并给出明确的 404，
 * 而不是让用户传完图才发现没人认领。
 *
 * 刻意不复用 `getProjectById`：把整行取出来会让一次 presign 顺带把项目名与描述
 * 读进内存，更麻烦的是后来者容易顺手拿那一行去做别的判断，
 * 让这条本该只有「存在性」语义的调用悄悄长出别的依赖。
 */
export async function projectExists(id: string): Promise<boolean> {
	const [row] = await db
		.select({ id: projects.id })
		.from(projects)
		.where(eq(projects.id, id))
		.limit(1);
	return row !== undefined;
}

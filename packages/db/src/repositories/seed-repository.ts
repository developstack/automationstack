import { inArray } from "drizzle-orm";

import { db } from "../index";
import { projects } from "../schema/projects";
import type { ImportCaseInput, ImportCaseRow } from "./case-import-repository";
import { importTestCases } from "./case-import-repository";
import { ensureModulePath } from "./module-path-repository";
import { addProjectMember } from "./project-members-repository";
import { createProject, getProjectByName } from "./projects-repository";

const SEED_ACTOR = "种子脚本";

export type SeedCaseSpec = Omit<ImportCaseInput, "moduleId" | "sourceRef"> & {
	sourceRef: string;
};

export interface SeedModuleSpec {
	cases: SeedCaseSpec[];
	path: string[];
}

export interface SeedProjectSpec {
	description: string;
	modules: SeedModuleSpec[];
	name: string;
}

export type SeedOwnerOutcome = "added" | "already-member" | "not-requested";

export interface SeedProjectResult {
	casesCreated: number;
	casesSkipped: number;
	errors: string[];
	modulesCreated: number;
	owner: SeedOwnerOutcome;
	projectCreated: boolean;
	projectId: string;
}

export async function resetBusinessData(): Promise<{ projects: number }> {
	if (process.env.NODE_ENV === "production") {
		throw new Error(
			"resetBusinessData: 拒绝在生产环境执行——该操作会删除全部项目及其级联数据（模块/用例/版本/AI 会话），且没有二次确认。"
		);
	}
	const rows = await db.delete(projects).returning({ id: projects.id });
	return { projects: rows.length };
}

export async function deleteProjectsByNames(
	names: string[]
): Promise<{ names: string[] }> {
	if (names.length === 0) {
		return { names: [] };
	}
	const rows = await db
		.delete(projects)
		.where(inArray(projects.name, names))
		.returning({ name: projects.name });
	return { names: rows.map((row) => row.name) };
}

async function collectSeedRows(
	projectId: string,
	specs: SeedModuleSpec[]
): Promise<{ modulesCreated: number; rows: ImportCaseRow[] }> {
	const rows: ImportCaseRow[] = [];
	let modulesCreated = 0;
	for (const spec of specs) {
		// biome-ignore lint/performance/noAwaitInLoops: 逐级建模块需串行，且各路径共享父级
		const ensured = await ensureModulePath({ path: spec.path, projectId });
		if (ensured.kind !== "ok") {
			throw new Error(
				`seedProject: 模块路径 ${spec.path.join("/")} 创建失败（${ensured.kind}）`
			);
		}
		modulesCreated += ensured.createdModuleIds.length;
		for (const item of spec.cases) {
			rows.push({
				index: rows.length,
				item: { ...item, moduleId: ensured.moduleId },
			});
		}
	}
	return { modulesCreated, rows };
}

async function ensureSeedOwner(
	projectId: string,
	ownerUserId: string | undefined
): Promise<SeedOwnerOutcome> {
	if (ownerUserId === undefined) {
		return "not-requested";
	}
	const added = await addProjectMember({
		projectId,
		role: "owner",
		userId: ownerUserId,
	});
	return added === null ? "already-member" : "added";
}

export async function seedProject(
	spec: SeedProjectSpec,
	ownerUserId?: string
): Promise<SeedProjectResult> {
	const existing = await getProjectByName(spec.name);
	const project =
		existing ??
		(await createProject({ description: spec.description, name: spec.name }));
	const owner = await ensureSeedOwner(project.id, ownerUserId);
	const { modulesCreated, rows } = await collectSeedRows(
		project.id,
		spec.modules
	);
	const result = await importTestCases({
		actorName: SEED_ACTOR,
		onDuplicate: "skip",
		projectId: project.id,
		rows,
	});
	return {
		casesCreated: result.created.length,
		casesSkipped: result.skipped.length,
		errors: result.errors.map((item) => `#${item.index} ${item.message}`),
		modulesCreated,
		owner,
		projectCreated: existing === null,
		projectId: project.id,
	};
}

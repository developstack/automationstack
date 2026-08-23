import { inArray } from "drizzle-orm";

import { db } from "../index";
import { projects } from "../schema/projects";
import type { ImportCaseInput, ImportCaseRow } from "./case-import-repository";
import { importTestCases } from "./case-import-repository";
import { ensureModulePath } from "./module-path-repository";
import { createProject, getProjectByName } from "./projects-repository";

/** 种子写入的操作人，落到 last_modified_by / 版本快照的 savedBy。 */
const SEED_ACTOR = "种子脚本";

/**
 * 一条种子用例。`sourceRef` 必填且在项目内唯一，
 * 重复执行时靠 (projectId, sourceRef) 的部分唯一索引跳过，保证幂等。
 */
export type SeedCaseSpec = Omit<ImportCaseInput, "moduleId" | "sourceRef"> & {
	sourceRef: string;
};

export interface SeedModuleSpec {
	cases: SeedCaseSpec[];
	/** 从根到叶的模块名路径，缺失层级会被逐级创建。 */
	path: string[];
}

export interface SeedProjectSpec {
	description: string;
	modules: SeedModuleSpec[];
	name: string;
}

export interface SeedProjectResult {
	casesCreated: number;
	casesSkipped: number;
	errors: string[];
	modulesCreated: number;
	projectCreated: boolean;
	projectId: string;
}

/**
 * 清空全部业务数据：projects 是所有业务表的根，
 * modules / test_cases / case_versions / ai_* 均经外键级联删除。
 *
 * 生产环境直接拒绝执行：这是无二次确认的全库删除，
 * 守卫放在这里而非调用方，任何入口（脚本 / 未来的运维接口）都挡得住。
 */
export async function resetBusinessData(): Promise<{ projects: number }> {
	if (process.env.NODE_ENV === "production") {
		throw new Error(
			"resetBusinessData: 拒绝在生产环境执行——该操作会删除全部项目及其级联数据（模块/用例/版本/AI 会话），且没有二次确认。"
		);
	}
	const rows = await db.delete(projects).returning({ id: projects.id });
	return { projects: rows.length };
}

/** 按名称删除项目（含级联子数据），返回实际删除的数量。 */
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

/**
 * 幂等写入一个演示项目：项目按名称复用，模块按路径逐级补齐，
 * 用例走导入管道（onDuplicate=skip + sourceRef 去重），
 * 因此重复执行不会产生重复数据，只会补齐缺失部分。
 * 每条用例仍经快照管道落 v1 版本记录。
 */
export async function seedProject(
	spec: SeedProjectSpec
): Promise<SeedProjectResult> {
	const existing = await getProjectByName(spec.name);
	const project =
		existing ??
		(await createProject({ description: spec.description, name: spec.name }));
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
		projectCreated: existing === null,
		projectId: project.id,
	};
}

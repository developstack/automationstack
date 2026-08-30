import { inArray } from "drizzle-orm";

import { db } from "../index";
import { projects } from "../schema/projects";
import type { ImportCaseInput, ImportCaseRow } from "./case-import-repository";
import { importTestCases } from "./case-import-repository";
import { ensureModulePath } from "./module-path-repository";
import { addProjectMember } from "./project-members-repository";
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

/**
 * owner 成员记录这一步的结果。
 * - `added`：这次写进去的
 * - `already-member`：那个人已经在项目里了，角色原样不动
 * - `not-requested`：调用方没给 ownerUserId
 */
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
 * 把 owner 成员记录补上——**项目是新建还是复用都要走这一遍**。
 *
 * 复用那条分支才是重点：项目上一轮就 seed 过了，人却是后来才建的（账号一律
 * 由管理员手工创建，种子脚本从不建账号），缺的正是这一行。只在新建分支补，
 * 重建流程里最常见的那一次恰好就漏了。
 *
 * `onConflictDoNothing` 让它可重入：已经是成员就原样不动，既不报错也不改角色
 * ——已有的 owner 不会被降级，已经在项目里的 member 也不会被种子脚本悄悄提成
 * owner（改谁的权限该由人在成员管理页决定）。
 *
 * 刻意不与建项目并进一个事务（不走 `createProjectWithOwner`）：那只能覆盖新建
 * 那一半，而这里两条分支要走同一段逻辑。中间失败留下的「有项目没成员」正是
 * 重跑一次就能修好的状态，这也是种子脚本本来就承诺的幂等。
 */
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

/**
 * 幂等写入一个演示项目：项目按名称复用，模块按路径逐级补齐，
 * 用例走导入管道（onDuplicate=skip + sourceRef 去重），
 * 因此重复执行不会产生重复数据，只会补齐缺失部分。
 * 每条用例仍经快照管道落 v1 版本记录。
 *
 * `ownerUserId` 给了就把那个人设成项目 owner。**不给的后果是项目对所有非管理员
 * 不可见**（`project_members` 里没有行 = 谁都不是成员，见 `schema/project-members.ts`），
 * 所以调用方要么给，要么明确告诉用户它没给——静默跳过会造出一个「脚本说成功了、
 * 页面上什么都没有」的项目，那是最耗人的一种坏法。
 *
 * 收的是 userId 而不是用户名：用户名是人输入的口径，「这个人不存在怎么办」该在
 * CLI 边界回答（`scripts/seed-owner.ts`），repository 只负责写。
 */
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

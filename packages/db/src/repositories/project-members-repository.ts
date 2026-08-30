/**
 * 项目成员的读写。表与两档角色的完整理由见 `schema/project-members.ts`。
 *
 * 这个文件是全仓授权判定的**唯一数据来源**：`packages/api/src/index.ts` 的
 * `requireProjectMember` 中间件每次调用项目作用域的过程都会走一趟
 * `getProjectRole`，因此那一条查询刻意只取 `role` 一列。
 */

import { and, asc, eq, sql } from "drizzle-orm";

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

/**
 * 成员列表行：用户信息只带能安全下发的那几个字段。
 *
 * 与 `PublicUser` 同档，同样是独立声明的接口 + 逐字段构造，而不是
 * `Omit<User, "passwordHash">`——后者在给 users 加新的敏感列时会静默地把它
 * 带出去，独立接口则在少一个字段时编译期就报错。
 */
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

/**
 * 某人在某项目里的角色，不是成员则 `null`。**授权热路径**。
 *
 * 只取 `role` 一列、不回整行：调用方（中间件）要的就是这一个事实，
 * 回整行会让后来者顺手拿 `id` / `createdAt` 去做别的判断，
 * 让这条本该只有「角色」语义的查询悄悄长出别的依赖。
 * `(project_id, user_id)` 上的唯一索引让它是一次整条命中的等值查找。
 */
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

/** 某人所属的全部项目，字段与排序都与 `listProjects()` 对齐。 */
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

/**
 * 加成员；此人已在项目里时返回 null 而不是抛错。
 *
 * 与 `createUser` 同样的理由：`onConflictDoNothing` 把「查重 + 插入」并成一条
 * 语句，两个 owner 同时加同一个人时由唯一约束仲裁，不留先查后插的竞态窗口。
 */
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

/**
 * 项目里还剩几个 owner。用于拦「把最后一个 owner 降级 / 移除」——
 * 真发生了这个项目就再也没人能加人、改名、删除，只有平台 admin 能救。
 * 与 `countActiveAdmins` 是同一条思路，只是作用域从平台缩到项目。
 */
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

/**
 * 建项目 + 把建的人写成 owner，**一个事务**。
 *
 * 两步必须原子：只要 owner 那行没落地，这个项目就对所有人不可见（连创建者
 * 自己都进不去），而它已经存在于库里——只有平台 admin 才看得到并收拾。
 *
 * 跨了两个 repository，所以按仓库惯例由「组合方」持有事务、
 * 调用被组合方的 `*InTx`（先例：`case-import-repository` → `createTestCaseInTx`）。
 * 组合方落在这个文件而不是 `projects-repository`：这个函数存在的理由完全是
 * 成员那一侧，`createProject` 本身没有任何变化。
 */
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

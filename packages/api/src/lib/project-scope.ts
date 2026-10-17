import type { MindmapOperation } from "@automationstack/db/repositories/mindmap-operations";
import { getProjectRole } from "@automationstack/db/repositories/project-members-repository";
import {
	getProjectIdByCaseId,
	getProjectIdByModuleId,
	getProjectIdByRunAttachmentId,
	getProjectIdByRunCaseId,
	getProjectIdByRunId,
	listCaseProjects,
	listProjectIdsByMindmapNodes,
} from "@automationstack/db/repositories/project-scope-repository";
import { ORPCError } from "@orpc/server";

import type { Context } from "../context";
import { NOT_PROJECT_MEMBER_MESSAGE, o } from "../index";
import { collectMindmapBatchScope } from "./mindmap-batch-scope";
import { canEnterProject, type ProjectAccess } from "./project-access";

type ScopeUser = NonNullable<Context["user"]>;

function requireUser(context: Context): ScopeUser {
	if (context.user === null) {
		throw new ORPCError("UNAUTHORIZED", { message: "请先登录" });
	}
	return context.user;
}

async function enterProject(
	user: ScopeUser,
	projectId: string
): Promise<ProjectAccess> {
	const projectAccess: ProjectAccess = {
		platformRole: user.role,
		projectRole: await getProjectRole(projectId, user.id),
	};
	if (!canEnterProject(projectAccess)) {
		throw new ORPCError("FORBIDDEN", { message: NOT_PROJECT_MEMBER_MESSAGE });
	}
	return projectAccess;
}

function projectScopeMiddleware<TInput>(
	resolveProjectId: (input: TInput) => Promise<string | null>,
	notFoundMessage: string
) {
	return o.middleware(async ({ context, next }, input: TInput) => {
		const user = requireUser(context);
		const projectId = await resolveProjectId(input);
		if (projectId === null) {
			throw new ORPCError("NOT_FOUND", { message: notFoundMessage });
		}
		const projectAccess = await enterProject(user, projectId);
		return next({ context: { projectAccess } });
	});
}

function onlyProjectId(projectIds: readonly string[]): string | null {
	return projectIds.length === 1 ? (projectIds[0] ?? null) : null;
}

export const requireCaseMember = projectScopeMiddleware(
	(input: { caseId: string }) => getProjectIdByCaseId(input.caseId),
	"用例不存在"
);

/** 批量操作的范围：勾选的用例，或按筛选条件处理时筛选条件中的项目。 */
type CaseBatchScope = { caseIds: string[] } | { projectId: string };

/** 批量操作的输入（{ ids } 或 { filter }）转为 requireCasesMember 和 requireExistingCasesMember 的输入。 */
export const toCasesScope = (
	input: { ids: string[] } | { filter: { projectId: string } }
): CaseBatchScope =>
	"filter" in input
		? { projectId: input.filter.projectId }
		: { caseIds: input.ids };

/**
 * 勾选的用例：都存在、都在同一个项目中，并且当前用户可以进入这个项目。
 * 按筛选条件处理：当前用户可以进入筛选条件中的项目。
 */
export const requireCasesMember = projectScopeMiddleware(
	async (input: CaseBatchScope) => {
		if ("projectId" in input) {
			return input.projectId;
		}
		const rows = await listCaseProjects(input.caseIds);
		if (rows.length !== new Set(input.caseIds).size) {
			return null;
		}
		return onlyProjectId([...new Set(rows.map((row) => row.projectId))]);
	},
	"用例不存在，或分属不同项目"
);

/** 还存在的勾选用例所在的项目。一条都不存在时为 null；分属不同项目时抛出 NOT_FOUND。 */
async function existingCasesProjectId(
	caseIds: string[]
): Promise<string | null> {
	const rows = await listCaseProjects(caseIds);
	const projectIds = [...new Set(rows.map((row) => row.projectId))];
	if (projectIds.length > 1) {
		throw new ORPCError("NOT_FOUND", { message: "用例分属不同项目" });
	}
	return projectIds[0] ?? null;
}

/**
 * 批量删除用：还存在的勾选用例都在同一个项目中，并且当前用户可以进入这个项目。
 * 不存在的用例（例如已被别人删除）不参与检查；一条都不存在时没有要删除的用例，不检查项目。
 * 按筛选条件删除时检查筛选条件中的项目。
 * 检查通过的项目放在 context.casesProjectId 中，勾选的用例一条都不存在时为 null。
 */
export const requireExistingCasesMember = o.middleware(
	async ({ context, next }, input: CaseBatchScope) => {
		const user = requireUser(context);
		const casesProjectId =
			"projectId" in input
				? input.projectId
				: await existingCasesProjectId(input.caseIds);
		if (casesProjectId !== null) {
			await enterProject(user, casesProjectId);
		}
		return next({ context: { casesProjectId } });
	}
);

export const requireModuleMember = projectScopeMiddleware(
	(input: { moduleId: string }) => getProjectIdByModuleId(input.moduleId),
	"模块不存在"
);

export const requireRunMember = projectScopeMiddleware(
	(input: { runId: string }) => getProjectIdByRunId(input.runId),
	"测试任务不存在"
);

export const requireRunCaseMember = projectScopeMiddleware(
	(input: { runCaseId: string }) => getProjectIdByRunCaseId(input.runCaseId),
	"用例执行记录不存在"
);

export const requireRunAttachmentMember = projectScopeMiddleware(
	(input: { attachmentId: string }) =>
		getProjectIdByRunAttachmentId(input.attachmentId),
	"附件不存在"
);

export const requireMindmapBatchMember = projectScopeMiddleware(
	async (input: { operations: MindmapOperation[] }) => {
		const scope = collectMindmapBatchScope(input.operations);
		const resolved = await listProjectIdsByMindmapNodes(scope);
		return onlyProjectId([...new Set([...scope.projectIds, ...resolved])]);
	},
	"脑图批量操作引用的节点不存在，或分属不同项目"
);

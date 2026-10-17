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

import { NOT_PROJECT_MEMBER_MESSAGE, o } from "../index";
import { collectMindmapBatchScope } from "./mindmap-batch-scope";
import { canEnterProject, type ProjectAccess } from "./project-access";

function projectScopeMiddleware<TInput>(
	resolveProjectId: (input: TInput) => Promise<string | null>,
	notFoundMessage: string
) {
	return o.middleware(async ({ context, next }, input: TInput) => {
		if (context.user === null) {
			throw new ORPCError("UNAUTHORIZED", { message: "请先登录" });
		}
		const projectId = await resolveProjectId(input);
		if (projectId === null) {
			throw new ORPCError("NOT_FOUND", { message: notFoundMessage });
		}
		const projectAccess: ProjectAccess = {
			platformRole: context.user.role,
			projectRole: await getProjectRole(projectId, context.user.id),
		};
		if (!canEnterProject(projectAccess)) {
			throw new ORPCError("FORBIDDEN", { message: NOT_PROJECT_MEMBER_MESSAGE });
		}
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

/** 一组用例都存在、都在同一个项目中，并且当前用户可以进入这个项目。 */
export const requireCasesMember = projectScopeMiddleware(
	async (input: { caseIds: string[] }) => {
		const rows = await listCaseProjects(input.caseIds);
		if (rows.length !== new Set(input.caseIds).size) {
			return null;
		}
		return onlyProjectId([...new Set(rows.map((row) => row.projectId))]);
	},
	"用例不存在，或分属不同项目"
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

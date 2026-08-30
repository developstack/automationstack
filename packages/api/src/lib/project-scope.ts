/**
 * 按**子资源 id** 判项目级授权的一组中间件。
 *
 * `index.ts` 的 `requireProjectMember` 只能服务入参里直接带 projectId 的过程；
 * 而 `cases.get(id)`、`testRuns.submit(runId)`、`testRunAttachments.remove(attachmentId)`
 * 这些过程的入参里压根没有项目——先得把 id 解析成 projectId，才谈得上查角色。
 *
 * ## 为什么是「中间件工厂 + 仓库窄查询」，而不是让 handler 自己解析
 *
 * 让每个 handler 先查一次归属再判权限，是把同一段五行逻辑复制几十遍：漏写一处
 * 不会有任何东西变红，而漏写的那一处就是一个越权读写口。做成工厂之后，
 * 每个过程只需要多一行 `.use(requireXxxMember)`，「解析 → 找不到 → 不是成员」
 * 三种结局的处理全在下面这一个函数里，改一次全仓生效。
 *
 * 解析查询一律在 `@automationstack/db` 的 `project-scope-repository`
 * （api 包没有 drizzle 依赖，也不该有），每条只 select `project_id` 一列。
 *
 * ## 代价
 *
 * 这类过程每次多一次查询：解析一次 + `getProjectRole` 一次，共两次。刻意不做
 * 缓存——授权结论被缓存之后，「刚被移出项目的人还能再写几秒」这种事故既难复现
 * 也没人会想到去看缓存。两次主键等值查找换一条读得懂的授权链路，值。
 * 但**同一个 id 在一个过程里只解析一次**：解析发生在中间件里，handler 该查什么
 * 业务数据照常查，不要再为了权限多查一次归属。
 *
 * ## 找不到的时候报什么
 *
 * 统一 `NOT_FOUND`，不是 `FORBIDDEN`。能走到这里说明调用者已经登录，而
 * 「这条用例不存在」和「这条用例不属于你」在界面上要给的出路完全不同：前者回
 * 列表页，后者去找 owner 要权限。把两者混成一个码，等于让所有 404 都长得像
 * 权限问题。代价是它确认了「某个 uuid 对应一行真实数据」——与 `index.ts` 里
 * `requireProjectMember` 对项目 id 做的取舍完全一致，那里有更长的说明。
 */

import type { MindmapOperation } from "@automationstack/db/repositories/mindmap-operations";
import { getProjectRole } from "@automationstack/db/repositories/project-members-repository";
import {
	getProjectIdByCaseId,
	getProjectIdByModuleId,
	getProjectIdByRunAttachmentId,
	getProjectIdByRunCaseId,
	getProjectIdByRunId,
	listProjectIdsByMindmapNodes,
} from "@automationstack/db/repositories/project-scope-repository";
import { ORPCError } from "@orpc/server";

import { NOT_PROJECT_MEMBER_MESSAGE, o } from "../index";
import { collectMindmapBatchScope } from "./mindmap-batch-scope";
import { canEnterProject, type ProjectAccess } from "./project-access";

/**
 * 造一个「先把入参解析成 projectId，再判是不是本项目成员」的中间件。
 *
 * 与 `requireProjectMember` 一样**必须挂在 `.input()` 之后**，也一样把结论塞进
 * `context.projectAccess`——下游要判 owner 就读它，别再查一次库。
 */
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

/**
 * 一批 id 必须恰好落在一个项目里。
 *
 * 收到 0 个（id 全不存在）和收到 2 个以上（一次请求横跨多个项目）都返回 null，
 * 于是都被上面翻成 `NOT_FOUND`。跨项目那种情况其实更像 `BAD_REQUEST`，但合法
 * 客户端永远产生不出这种批次，把它和「不存在」并成一档能少一条谁都不会走到的
 * 分支；错误文案里两种可能都说清楚了。
 */
function onlyProjectId(projectIds: readonly string[]): string | null {
	return projectIds.length === 1 ? (projectIds[0] ?? null) : null;
}

export const requireCaseMember = projectScopeMiddleware(
	(input: { caseId: string }) => getProjectIdByCaseId(input.caseId),
	"用例不存在"
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

/**
 * 脑图批量：作用域怎么算出来的、tempId 那条时序规则为什么要命，
 * 全写在 `./mindmap-batch-scope.ts`。这里只负责「合并后必须恰好一个项目」。
 */
export const requireMindmapBatchMember = projectScopeMiddleware(
	async (input: { operations: MindmapOperation[] }) => {
		const scope = collectMindmapBatchScope(input.operations);
		const resolved = await listProjectIdsByMindmapNodes(scope);
		return onlyProjectId([...new Set([...scope.projectIds, ...resolved])]);
	},
	"脑图批量操作引用的节点不存在，或分属不同项目"
);

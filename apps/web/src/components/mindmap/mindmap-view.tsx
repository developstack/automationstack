/**
 * Data loading for the mindmap page: the tree plus the project name that the
 * canvas needs for its root node (`mindmap.tree` does not carry it).
 *
 * 作用域（整个项目 / 某个模块子树）来自 URL 上的 `moduleId`，由路由传进来。
 * 这里是 `MindmapScope` 的**唯一**构造点：画布、同步器、守卫拿到的都是这一个
 * 引用，谁也不会自己再拼一次查询参数（见 mindmap-scope.ts 的说明）。
 */
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from "@automationstack/ui/components/empty";
import { cn } from "@automationstack/ui/lib/utils";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { orpc } from "@/utils/orpc";

import { MindmapBudgetNotice } from "./mindmap-budget-notice.tsx";
import { MindmapCanvas } from "./mindmap-canvas.tsx";
import {
	createMindmapScope,
	isScopedMindmap,
	type MindmapScope,
} from "./mindmap-scope.ts";
import { MindmapScopeBar } from "./mindmap-scope-bar.tsx";
import { mindmapTreeQueryOptions } from "./mindmap-scope-query.ts";
import { MindmapSkeleton } from "./mindmap-skeleton.tsx";
import { isEmptyMindmapTree } from "./mindmap-tree-input.ts";

interface MindmapViewProps {
	/** URL 上的 `moduleId`；缺省 = 全量脑图。 */
	moduleId: string | undefined;
	projectId: string;
}

/**
 * 作用域视图下加载失败最常见的原因不是网络，而是这个模块已经被别人删了
 * （服务端返回 NOT_FOUND）。所以错误态也要带上回到全量脑图的出口，
 * 否则用户手里只剩一个刷不出来的地址。
 */
function MindmapError({ scope }: { scope: MindmapScope }) {
	return (
		// 不再叠 p-8：Empty 自己带 p-6 / md:p-12，外面这层只负责居中
		<div className="flex h-full flex-col">
			{isScopedMindmap(scope) ? (
				<MindmapScopeBar moduleName={undefined} projectId={scope.projectId} />
			) : null}
			<div className="flex min-h-0 flex-1 items-center justify-center">
				<Empty>
					<EmptyHeader>
						<EmptyTitle>脑图加载失败</EmptyTitle>
						<EmptyDescription>
							{isScopedMindmap(scope)
								? "该模块可能已被删除。请返回全量脑图，或切换到列表视图继续工作。"
								: "请检查网络连接后刷新页面，或切换到列表视图继续工作。"}
						</EmptyDescription>
					</EmptyHeader>
				</Empty>
			</div>
		</div>
	);
}

/**
 * 这一棵树的查询。单拎成 hook 有两个理由：下面那段取舍值得单独一段说明，
 * 而 MindmapView 本身已经贴着 max-lines-per-function 的 50 行上限。
 *
 * keepPreviousData：切模块（作用域一变，queryKey 就变）时留住上一棵树，
 * 画布不会先整块塌成骨架再涨回来。全站列表型查询都是这个约定——
 * cases（case-list-view.tsx）、test-runs（test-run-list-view.tsx）、
 * 用例挑选器（case-picker.tsx）三处在先，这里是最后一处补齐。
 *
 * 为什么在调用点加而不是加进 mindmapTreeQueryOptions：同步器
 * （mindmap-sync-runner.ts）也用那份 options，它要的是「缓存里现在到底有没有
 * 这一棵」，给它一份上一次的旧树会把同步写到错的作用域上。
 *
 * 换 key 重建画布与旧数据不冲突：画布挂载时先用旧快照初始化，新数据到达后由
 * MindmapCanvas 里那个 syncExternal 的 effect 吸收（它本来就是为「别人改的、
 * 从 invalidate 回来的数据」准备的），不需要第二次重建。
 */
function useMindmapTree(scope: MindmapScope) {
	return useQuery({
		...mindmapTreeQueryOptions(scope),
		placeholderData: keepPreviousData,
	});
}

export function MindmapView({ moduleId, projectId }: MindmapViewProps) {
	const scope = useMemo(
		() => createMindmapScope(projectId, moduleId),
		[moduleId, projectId]
	);
	const projectQuery = useQuery(
		orpc.projects.get.queryOptions({ input: { id: projectId } })
	);
	const treeQuery = useMindmapTree(scope);

	if (projectQuery.isError || treeQuery.isError) {
		return <MindmapError scope={scope} />;
	}
	const project = projectQuery.data;
	const tree = treeQuery.data;
	if (project === undefined || tree === undefined) {
		return <MindmapSkeleton />;
	}

	return (
		/*
		 * 「这份是旧的，新的还在路上」：淡到 60%，与 case-table.tsx 的 STALE_CLASS
		 * 逐字同款（transition-crossfade 只列 opacity 一个属性，只淡不动——
		 * 位移或缩放会让整块画布晃一下，比原来的骨架还糟）。
		 */
		<div
			className={cn(
				"flex h-full flex-col transition-crossfade",
				treeQuery.isPlaceholderData && "opacity-60"
			)}
		>
			{isScopedMindmap(scope) ? (
				<MindmapScopeBar
					moduleName={tree.modules.at(0)?.name}
					projectId={projectId}
				/>
			) : null}
			{isEmptyMindmapTree(tree) ? (
				<p className="px-4 py-2 text-muted-foreground text-sm">
					该项目还没有模块：选中中间的项目节点，按 Tab 新建第一个模块。
				</p>
			) : null}
			<MindmapBudgetNotice data={tree} project={project} />
			<div className="min-h-0 flex-1">
				{/*
				 * key：换作用域时整块重建。画布的实例只在挂载时用 snapshotRef 里的
				 * 那一份数据初始化，不换 key 的话切模块会拿旧快照重建一次。
				 */}
				<MindmapCanvas
					data={tree}
					key={`${scope.projectId}:${scope.moduleId ?? ""}`}
					project={project}
					scope={scope}
				/>
			</div>
		</div>
	);
}

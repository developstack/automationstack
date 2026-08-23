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
import { useQuery } from "@tanstack/react-query";
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

export function MindmapView({ moduleId, projectId }: MindmapViewProps) {
	const scope = useMemo(
		() => createMindmapScope(projectId, moduleId),
		[moduleId, projectId]
	);
	const projectQuery = useQuery(
		orpc.projects.get.queryOptions({ input: { id: projectId } })
	);
	const treeQuery = useQuery(mindmapTreeQueryOptions(scope));

	if (projectQuery.isError || treeQuery.isError) {
		return <MindmapError scope={scope} />;
	}
	const project = projectQuery.data;
	const tree = treeQuery.data;
	if (project === undefined || tree === undefined) {
		return <MindmapSkeleton />;
	}

	return (
		<div className="flex h-full flex-col">
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

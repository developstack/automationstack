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
	moduleId: string | undefined;
	projectId: string;
}

function MindmapError({ scope }: { scope: MindmapScope }) {
	return (
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

import { cn } from "@automationstack/ui/lib/utils";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { orpc } from "@/utils/orpc";

import { MindmapBudgetNotice } from "./mindmap-budget-notice.tsx";
import { MindmapCanvas } from "./mindmap-canvas.tsx";
import { MindmapEmptyNotice } from "./mindmap-empty-notice.tsx";
import { MINDMAP_BODY_CLASS, MINDMAP_PANEL_CLASS } from "./mindmap-layout.ts";
import {
	MindmapLoadError,
	type MindmapLoadQuery,
} from "./mindmap-load-error.tsx";
import {
	createMindmapScope,
	isScopedMindmap,
	type MindmapScope,
} from "./mindmap-scope.ts";
import { MindmapScopeBar } from "./mindmap-scope-bar.tsx";
import { mindmapTreeQueryOptions } from "./mindmap-scope-query.ts";
import { MindmapSkeleton } from "./mindmap-skeleton.tsx";
import {
	isEmptyMindmapTree,
	type MindmapProject,
	type MindmapTreeData,
} from "./mindmap-tree-input.ts";

interface MindmapViewProps {
	moduleId: string | undefined;
	projectId: string;
}

interface MindmapErrorPanelProps {
	project: MindmapLoadQuery;
	projectId: string;
	scoped: boolean;
	tree: MindmapLoadQuery;
}

function MindmapErrorPanel({
	project,
	projectId,
	scoped,
	tree,
}: MindmapErrorPanelProps) {
	return (
		<div className={MINDMAP_BODY_CLASS}>
			<div className={MINDMAP_PANEL_CLASS}>
				{scoped ? (
					<MindmapScopeBar moduleName={undefined} projectId={projectId} />
				) : null}
				<div className="flex min-h-0 flex-1 items-center justify-center">
					<MindmapLoadError project={project} tree={tree} />
				</div>
			</div>
		</div>
	);
}

interface MindmapContentProps {
	project: MindmapProject;
	scope: MindmapScope;
	stale: boolean;
	tree: MindmapTreeData;
}

function MindmapContent({ project, scope, stale, tree }: MindmapContentProps) {
	return (
		<div
			className={cn(
				MINDMAP_BODY_CLASS,
				"transition-crossfade",
				stale && "opacity-60"
			)}
		>
			{isEmptyMindmapTree(tree) ? <MindmapEmptyNotice /> : null}
			<MindmapBudgetNotice data={tree} project={project} />
			<div className={MINDMAP_PANEL_CLASS}>
				{isScopedMindmap(scope) ? (
					<MindmapScopeBar
						moduleName={tree.modules.at(0)?.name}
						projectId={scope.projectId}
					/>
				) : null}
				<div className="min-h-0 flex-1">
					<MindmapCanvas
						data={tree}
						key={`${scope.projectId}:${scope.moduleId ?? ""}`}
						project={project}
						scope={scope}
					/>
				</div>
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
	const treeQuery = useQuery({
		...mindmapTreeQueryOptions(scope),
		placeholderData: keepPreviousData,
	});

	if (projectQuery.isError || treeQuery.isError) {
		return (
			<MindmapErrorPanel
				project={projectQuery}
				projectId={projectId}
				scoped={isScopedMindmap(scope)}
				tree={treeQuery}
			/>
		);
	}
	const project = projectQuery.data;
	const tree = treeQuery.data;
	if (project === undefined || tree === undefined) {
		return <MindmapSkeleton />;
	}
	return (
		<MindmapContent
			project={project}
			scope={scope}
			stale={treeQuery.isPlaceholderData}
			tree={tree}
		/>
	);
}

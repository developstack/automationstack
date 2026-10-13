import { ClientOnly, createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";

import { PageHeader } from "@/components/layout/page-header";
import { PageTransition } from "@/components/layout/page-transition";
import { WORKSPACE_VIEW_LABELS } from "@/components/layout/workspace-path";
import { MINDMAP_PAGE_CLASS } from "@/components/mindmap/mindmap-layout";
import { MindmapSkeleton } from "@/components/mindmap/mindmap-skeleton";
import { workspaceSearchSchema } from "@/components/workspace/workspace-search";

export const Route = createFileRoute("/projects/$projectId/mindmap")({
	component: MindmapPage,
	ssr: false,
	validateSearch: workspaceSearchSchema,
});

const LazyMindmapView = lazy(async () => {
	const module = await import("@/components/mindmap/mindmap-view");
	return { default: module.MindmapView };
});

const FALLBACK = <MindmapSkeleton />;

function MindmapPage() {
	const { projectId } = Route.useParams();
	const { moduleId } = Route.useSearch();

	return (
		<PageTransition className={MINDMAP_PAGE_CLASS}>
			<PageHeader title={WORKSPACE_VIEW_LABELS.mindmap} />
			<div className="min-h-0 flex-1">
				<ClientOnly fallback={FALLBACK}>
					<Suspense fallback={FALLBACK}>
						<LazyMindmapView moduleId={moduleId} projectId={projectId} />
					</Suspense>
				</ClientOnly>
			</div>
		</PageTransition>
	);
}

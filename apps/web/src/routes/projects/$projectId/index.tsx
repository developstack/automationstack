import { createFileRoute } from "@tanstack/react-router";

import { caseListInput } from "@/components/cases/case-list-query";
import { CaseListSkeleton } from "@/components/cases/case-list-skeleton";
import {
	CASE_LIST_MAIN,
	CaseListView,
} from "@/components/cases/case-list-view";
import { PageTransition } from "@/components/layout/page-transition";
import type { WorkspaceSearch } from "@/components/workspace/workspace-search";
import { workspaceSearchSchema } from "@/components/workspace/workspace-search";

const caseListLoaderDeps = ({ search }: { search: WorkspaceSearch }) => ({
	moduleId: search.moduleId,
});

export const Route = createFileRoute("/projects/$projectId/")({
	component: CaseListPage,
	loader: ({ context, deps, params }) =>
		context.queryClient.ensureQueryData(
			context.orpc.cases.list.queryOptions({
				input: caseListInput(params.projectId, { moduleId: deps.moduleId }),
			})
		),
	loaderDeps: caseListLoaderDeps,
	pendingComponent: CaseListPending,
	validateSearch: workspaceSearchSchema,
});

function CaseListPending() {
	return (
		<PageTransition className={CASE_LIST_MAIN} phase="pending">
			<CaseListSkeleton />
		</PageTransition>
	);
}

function CaseListPage() {
	const { projectId } = Route.useParams();
	return <CaseListView projectId={projectId} />;
}

import { Skeleton } from "@automationstack/ui/components/skeleton";

import { PageHeader } from "@/components/layout/page-header";
import { WORKSPACE_VIEW_LABELS } from "@/components/layout/workspace-path";
import { ToolbarSkeleton } from "@/components/skeletons/toolbar-skeleton";
import { TestRunListSkeleton } from "@/components/test-runs/test-run-list-skeleton";

function TestRunListNoteSkeleton() {
	return <Skeleton aria-hidden="true" className="h-4 w-full" />;
}

export function TestRunListPageSkeleton() {
	return (
		<>
			<PageHeader
				actions={<Skeleton className="h-8 w-28" />}
				title={WORKSPACE_VIEW_LABELS.testRuns}
			/>
			<ToolbarSkeleton endGap="gap-3" startWrap={true} />
			<TestRunListNoteSkeleton />
			<TestRunListSkeleton />
		</>
	);
}

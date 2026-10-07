import { Skeleton } from "@automationstack/ui/components/skeleton";

import { ToolbarSkeleton } from "@/components/skeletons/toolbar-skeleton";
import { TestRunListSkeleton } from "@/components/test-runs/test-run-list-skeleton";

function TestRunListNoteSkeleton() {
	return <Skeleton aria-hidden="true" className="h-4 w-full" />;
}

export function TestRunListPageSkeleton() {
	return (
		<>
			<ToolbarSkeleton endGap="gap-3" startWrap={true} />
			<TestRunListNoteSkeleton />
			<TestRunListSkeleton />
		</>
	);
}

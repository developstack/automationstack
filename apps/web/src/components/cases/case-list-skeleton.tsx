import { Skeleton } from "@automationstack/ui/components/skeleton";

import { CaseListBodySkeleton } from "@/components/cases/case-list-body-skeleton";
import { PageHeader } from "@/components/layout/page-header";
import { WORKSPACE_VIEW_LABELS } from "@/components/layout/workspace-path";

export function CaseListSkeleton() {
	return (
		<>
			<PageHeader
				actions={<Skeleton className="h-8 w-24" />}
				title={WORKSPACE_VIEW_LABELS.list}
			/>
			<CaseListBodySkeleton />
		</>
	);
}

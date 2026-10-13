import { Skeleton } from "@automationstack/ui/components/skeleton";

import { CASE_PAGE_SIZE } from "@/components/cases/case-list-query";
import { CaseTableSkeleton } from "@/components/cases/case-table-skeleton";
import { PageHeader } from "@/components/layout/page-header";
import { WORKSPACE_VIEW_LABELS } from "@/components/layout/workspace-path";
import { ToolbarSkeleton } from "@/components/skeletons/toolbar-skeleton";

export function CaseListSkeleton() {
	return (
		<>
			<PageHeader
				actions={<Skeleton className="h-8 w-24" />}
				title={WORKSPACE_VIEW_LABELS.list}
			/>
			<ToolbarSkeleton endGap="gap-2" startWrap={false} />
			<CaseTableSkeleton rows={CASE_PAGE_SIZE} />
		</>
	);
}

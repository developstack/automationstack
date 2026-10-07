import { CASE_PAGE_SIZE } from "@/components/cases/case-list-query";
import { CaseTableSkeleton } from "@/components/cases/case-table-skeleton";
import { ToolbarSkeleton } from "@/components/skeletons/toolbar-skeleton";

export function CaseListSkeleton() {
	return (
		<>
			<ToolbarSkeleton endGap="gap-2" startWrap={false} />
			<CaseTableSkeleton rows={CASE_PAGE_SIZE} />
		</>
	);
}

import { Skeleton } from "@automationstack/ui/components/skeleton";

import { CASE_PAGE_SIZE } from "@/components/cases/case-list-query";
import { CASE_LIST_PANEL_CLASS } from "@/components/cases/case-table-layout";
import { CaseTableSkeleton } from "@/components/cases/case-table-skeleton";

/** 筛选栏的骨架：名称、状态、优先级和标签，宽度与 CaseFilters 一致。 */
function CaseFiltersSkeleton() {
	return (
		<div aria-hidden="true" className="flex flex-wrap items-center gap-2">
			<Skeleton className="h-8 w-64 max-w-full" />
			<Skeleton className="h-8 w-52" />
			<Skeleton className="h-8 w-36" />
			<Skeleton className="h-8 w-20" />
		</div>
	);
}

/** 页面头部以下的骨架：筛选栏和卡片面板。项目外框的骨架屏也使用它。 */
export function CaseListBodySkeleton() {
	return (
		<>
			<CaseFiltersSkeleton />
			<div className={CASE_LIST_PANEL_CLASS}>
				<CaseTableSkeleton rows={CASE_PAGE_SIZE} />
			</div>
		</>
	);
}

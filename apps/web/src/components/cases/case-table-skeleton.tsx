import { Skeleton } from "@automationstack/ui/components/skeleton";

import { CASE_PAGE_SIZE } from "@/components/cases/case-list-query";
import {
	CASE_LIST_FOOTER_CLASS,
	CASE_SKELETON_COLUMNS,
	CASE_TABLE_ROW_HEIGHT,
} from "@/components/cases/case-table-layout";
import { TableSkeleton } from "@/components/skeletons/table-skeleton";

interface CaseTableSkeletonProps {
	rows?: number;
}

/** 卡片面板中的表格和底部分页的骨架屏。 */
export function CaseTableSkeleton({
	rows = CASE_PAGE_SIZE,
}: CaseTableSkeletonProps) {
	return (
		<>
			<TableSkeleton
				columns={CASE_SKELETON_COLUMNS}
				label="用例列表加载中"
				rowHeight={CASE_TABLE_ROW_HEIGHT}
				rows={rows}
			/>
			<div aria-hidden="true" className={CASE_LIST_FOOTER_CLASS}>
				<Skeleton className="h-4 w-36" />
				<Skeleton className="h-7 w-48" />
			</div>
		</>
	);
}

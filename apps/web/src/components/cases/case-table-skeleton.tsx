import { Skeleton } from "@automationstack/ui/components/skeleton";

import { CASE_PAGE_SIZE } from "@/components/cases/case-list-query";
import {
	CASE_LIST_FOOTER_CLASS,
	CASE_TABLE_ROW_HEIGHT,
} from "@/components/cases/case-table-layout";
import {
	TableSkeleton,
	type TableSkeletonColumn,
} from "@/components/skeletons/table-skeleton";

// 列宽和内边距与 CASE_TABLE_COLUMNS 一致
const CASE_SKELETON_COLUMNS: readonly TableSkeletonColumn[] = [
	{ head: "w-7", label: "名称", value: "w-4/5", width: "flex-1 pl-4" },
	{ head: "w-10", label: "优先级", value: "w-2/3", width: "w-16 shrink-0" },
	{ head: "w-7", label: "类型", value: "w-2/3", width: "w-16 shrink-0" },
	{ head: "w-7", label: "状态", value: "w-3/4", width: "w-20 shrink-0" },
	{ head: "w-7", label: "标签", value: "w-2/3", width: "flex-1" },
	{ head: "w-10", label: "维护人", value: "w-1/2", width: "flex-1" },
	{ head: "w-14", label: "更新时间", value: "w-full", width: "w-32 shrink-0" },
	{ head: "w-7", label: "协作", value: "w-2/3", width: "w-24 shrink-0 pr-4" },
];

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

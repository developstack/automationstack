import { Skeleton } from "@automationstack/ui/components/skeleton";

import {
	TableSkeleton,
	type TableSkeletonColumn,
} from "@/components/skeletons/table-skeleton";
import { ReportCardSkeleton } from "@/components/test-runs/report-card-skeleton";

const PRIORITY_ROWS = 4;

const PRIORITY_SKELETON_COLUMNS: readonly TableSkeletonColumn[] = [
	{ head: "w-10", label: "优先级", value: "w-8", width: "w-16 shrink-0" },
	{
		head: "w-7",
		label: "总数",
		value: "w-6",
		width: "flex w-16 shrink-0 justify-end",
	},
	{
		head: "w-7",
		label: "通过",
		value: "w-6",
		width: "flex w-16 shrink-0 justify-end",
	},
	{
		head: "w-7",
		label: "失败",
		value: "w-6",
		width: "flex w-16 shrink-0 justify-end",
	},
	{
		head: "w-10",
		label: "通过率",
		value: "w-10",
		width: "flex flex-1 justify-end",
	},
];

export function ReportPriorityCardSkeleton() {
	return (
		<ReportCardSkeleton descriptionWidth="w-80" titleWidth="w-36">
			<Skeleton className="h-9 w-full" />
			<TableSkeleton
				columns={PRIORITY_SKELETON_COLUMNS}
				header={false}
				rows={PRIORITY_ROWS}
				spacing="inset"
			/>
		</ReportCardSkeleton>
	);
}

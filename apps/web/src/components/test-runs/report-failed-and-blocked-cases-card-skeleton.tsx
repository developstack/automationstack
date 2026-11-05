import {
	TableSkeleton,
	type TableSkeletonColumn,
} from "@/components/skeletons/table-skeleton";
import { ReportCardSkeleton } from "@/components/test-runs/report-card-skeleton";

const SKELETON_ROWS = 4;

const FAILED_AND_BLOCKED_SKELETON_COLUMNS: readonly TableSkeletonColumn[] = [
	{ head: "w-10", label: "用例名", value: "w-4/5", width: "flex-1" },
	{ head: "w-7", label: "结果", value: "w-8", width: "w-16 shrink-0" },
	{ head: "w-7", label: "模块", value: "w-2/3", width: "flex-1" },
	{ head: "w-10", label: "优先级", value: "w-8", width: "w-16 shrink-0" },
	{ head: "w-20", label: "执行人 / 来源", value: "w-1/2", width: "flex-1" },
	{ head: "w-7", label: "说明", value: "w-4/5", width: "flex-1" },
	{ head: "w-7", label: "截图", value: "w-8", width: "w-16 shrink-0" },
];

export function ReportFailedAndBlockedCasesCardSkeleton() {
	return (
		<ReportCardSkeleton descriptionWidth="w-96" titleWidth="w-40">
			<TableSkeleton
				columns={FAILED_AND_BLOCKED_SKELETON_COLUMNS}
				header={false}
				rows={SKELETON_ROWS}
				spacing="inset"
			/>
		</ReportCardSkeleton>
	);
}

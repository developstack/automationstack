import {
	TableSkeleton,
	type TableSkeletonColumn,
} from "@/components/skeletons/table-skeleton";
import { ReportCardSkeleton } from "@/components/test-runs/report-card-skeleton";

const FAILED_ROWS = 4;

const FAILED_SKELETON_COLUMNS: readonly TableSkeletonColumn[] = [
	{ head: "w-10", label: "用例名", value: "w-4/5", width: "flex-1" },
	{ head: "w-7", label: "模块", value: "w-2/3", width: "flex-1" },
	{ head: "w-10", label: "优先级", value: "w-8", width: "w-16 shrink-0" },
	{ head: "w-20", label: "执行人 / 来源", value: "w-1/2", width: "flex-1" },
	{ head: "w-7", label: "说明", value: "w-4/5", width: "flex-1" },
	{ head: "w-7", label: "截图", value: "w-8", width: "w-16 shrink-0" },
	{ head: "w-7", label: "Jira", value: "w-10", width: "w-20 shrink-0" },
	{ head: "w-14", label: "Jira 状态", value: "w-12", width: "w-20 shrink-0" },
];

export function ReportFailedCasesCardSkeleton() {
	return (
		<ReportCardSkeleton descriptionWidth="w-96" titleWidth="w-28">
			<TableSkeleton
				columns={FAILED_SKELETON_COLUMNS}
				header={false}
				rows={FAILED_ROWS}
				spacing="inset"
			/>
		</ReportCardSkeleton>
	);
}

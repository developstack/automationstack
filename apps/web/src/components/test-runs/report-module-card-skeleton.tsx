import {
	TableSkeleton,
	type TableSkeletonColumn,
} from "@/components/skeletons/table-skeleton";
import { ReportCardSkeleton } from "@/components/test-runs/report-card-skeleton";

const MODULE_ROWS = 4;

const MODULE_SKELETON_COLUMNS: readonly TableSkeletonColumn[] = [
	{ head: "w-7", label: "模块", value: "w-3/5", width: "flex-1" },
	...(["总数", "通过", "失败", "阻塞", "跳过", "未测", "通过率"] as const).map(
		(label) => ({
			head: "w-7",
			label,
			value: "w-6",
			width: "flex w-14 shrink-0 justify-end",
		})
	),
];

export function ReportModuleCardSkeleton() {
	return (
		<ReportCardSkeleton descriptionWidth="w-72" titleWidth="w-40">
			<TableSkeleton
				columns={MODULE_SKELETON_COLUMNS}
				header={false}
				rows={MODULE_ROWS}
				spacing="inset"
			/>
		</ReportCardSkeleton>
	);
}

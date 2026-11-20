import { PageHeader } from "@/components/layout/page-header";
import { WORKSPACE_VIEW_LABELS } from "@/components/layout/workspace-path";
import {
	TableSkeleton,
	type TableSkeletonColumn,
} from "@/components/skeletons/table-skeleton";
import { ToolbarSkeleton } from "@/components/skeletons/toolbar-skeleton";

const REPORT_SKELETON_COLUMNS: readonly TableSkeletonColumn[] = [
	{ head: "w-14", label: "测试报告", value: "w-4/5", width: "flex-1" },
	{ head: "w-14", label: "提交时间", value: "w-full", width: "w-28 shrink-0" },
	{ head: "w-10", label: "提交人", value: "w-1/2", width: "flex-1" },
	{ head: "w-10", label: "用例数", value: "w-1/2", width: "w-16 shrink-0" },
	{ head: "w-10", label: "通过率", value: "w-1/2", width: "w-20 shrink-0" },
	{ head: "w-7", label: "失败", value: "w-1/2", width: "w-14 shrink-0" },
	{ head: "w-7", label: "阻塞", value: "w-1/2", width: "w-14 shrink-0" },
];

export function ReportListPageSkeleton() {
	return (
		<>
			<PageHeader title={WORKSPACE_VIEW_LABELS.reports} />
			<ToolbarSkeleton endGap="gap-3" startWrap={true} />
			<TableSkeleton
				columns={REPORT_SKELETON_COLUMNS}
				label="测试报告列表加载中"
				rows={5}
			/>
		</>
	);
}

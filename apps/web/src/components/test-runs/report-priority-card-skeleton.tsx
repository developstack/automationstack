import { Skeleton } from "@automationstack/ui/components/skeleton";

import {
	TableSkeleton,
	type TableSkeletonColumn,
} from "@/components/skeletons/table-skeleton";
import { ReportCardSkeleton } from "@/components/test-runs/report-card-skeleton";

/**
 * 按优先级那张卡的骨架（从 report-skeleton.tsx 拆出来）。
 *
 * 高度换算表见 report-skeleton.tsx 的头注释，⚠️ 高度与宽度类名一个字符都不许改。
 */

/** 表格行数取中间值，理由见 report-skeleton.tsx 头注释。 */
const PRIORITY_ROWS = 4;

/*
 * 下面这组列描述对着 report-priority-card.tsx 里的 <TableHead> 逐列抄的：
 * 钉了宽的列照抄宽度类并补 shrink-0，没钉宽的自由文本列填 flex-1；
 * `text-right` 的数字列在骨架里换成 `flex justify-end`，让那一小段灰条也贴
 * 右边——它代表的是数字本身。
 *
 * 这张表不画表头（header={false}）：真身的表头由 <Table> 渲染，而这张卡
 * 原本就没有为表头留位置，凭空补一条会高出 41px。
 */

/**
 * 对齐 ReportPriorityCard：P0 结论条 + 优先级表
 * （与它同为两列宽，见 report-skeleton.tsx 里的包装层）。
 */
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
			{/* P0 结论条：px-3 py-2 + text-sm 一行 ≈ 37px */}
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

import {
	TableSkeleton,
	type TableSkeletonColumn,
} from "@/components/skeletons/table-skeleton";
import { ReportCardSkeleton } from "@/components/test-runs/report-card-skeleton";

/**
 * 按模块那张卡的骨架（从 report-skeleton.tsx 拆出来）。
 *
 * 高度换算表见 report-skeleton.tsx 的头注释，⚠️ 高度与宽度类名一个字符都不许改。
 */

/** 表格行数取中间值，理由见 report-skeleton.tsx 头注释。 */
const MODULE_ROWS = 4;

/*
 * 下面这组列描述对着 report-module-card.tsx 里的 <TableHead> 逐列抄的：
 * 钉了宽的列照抄宽度类并补 shrink-0，没钉宽的自由文本列填 flex-1；
 * `text-right` 的数字列在骨架里换成 `flex justify-end`，让那一小段灰条也贴
 * 右边——它代表的是数字本身。
 *
 * 这张表不画表头（header={false}）：真身的表头由 <Table> 渲染，而这张卡
 * 原本就没有为表头留位置，凭空补一条会高出 41px。
 */

/**
 * 对齐 ReportModuleCard：模块表，条数取中间值
 * （理由见 report-skeleton.tsx 头注释）。
 */
/** 六个计数列 + 通过率，全部右对齐；模块名是自由文本，吃掉剩余宽度。 */
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

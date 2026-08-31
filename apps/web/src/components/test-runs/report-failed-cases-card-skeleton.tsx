import {
	TableSkeleton,
	type TableSkeletonColumn,
} from "@/components/skeletons/table-skeleton";
import { ReportCardSkeleton } from "@/components/test-runs/report-card-skeleton";

/**
 * 失败用例清单卡的骨架（从 report-skeleton.tsx 拆出来）。
 *
 * 高度换算表见 report-skeleton.tsx 的头注释，⚠️ 高度与宽度类名一个字符都不许改。
 */

/** 表格行数取中间值，理由见 report-skeleton.tsx 头注释。 */
const FAILED_ROWS = 4;

/*
 * 下面这组列描述对着 report-failed-cases-card.tsx 里的 <TableHead> 逐列抄的：
 * 钉了宽的列照抄宽度类并补 shrink-0，没钉宽的自由文本列填 flex-1。
 *
 * 这张表不画表头（header={false}）：真身的表头由 <Table> 渲染，而这张卡
 * 原本就没有为表头留位置，凭空补一条会高出 41px。
 */

/** 对齐 ReportFailedCasesCard：失败清单表，条数同样取中间值。 */
/** 八列全是左对齐的自由文本/短标记；截图与 Jira 两列内容有上界，钉住宽度。 */
const FAILED_SKELETON_COLUMNS: readonly TableSkeletonColumn[] = [
	{ head: "w-10", label: "用例名", value: "w-4/5", width: "flex-1" },
	{ head: "w-7", label: "模块", value: "w-2/3", width: "flex-1" },
	{ head: "w-10", label: "优先级", value: "w-8", width: "w-16 shrink-0" },
	{ head: "w-20", label: "执行人 / 来源", value: "w-1/2", width: "flex-1" },
	{ head: "w-14", label: "失败原因", value: "w-4/5", width: "flex-1" },
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

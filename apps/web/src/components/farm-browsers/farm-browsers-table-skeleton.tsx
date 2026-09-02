/**
 * 镜像库表的加载骨架，逐条对着 farm-browsers-table.tsx 的表头与行填。
 */
import {
	TableSkeleton,
	type TableSkeletonColumn,
} from "@/components/skeletons/table-skeleton";

/**
 * 真表头没有列宽类，自由文本列一律 flex-1；镜像是最长的一列，给两份权重
 * （flex-[2] 是任意值语法，门禁禁用——所以并排放两条 flex-1 达不到的差别只能
 * 认了，改用 value 的宽度比例来暗示：镜像列的条更长）。
 * 「默认」列只可能出现一枚小徽标，钉成 w-12；行尾两颗图标按钮，钉成 w-20 右对齐。
 * 「默认」与「操作」两个表头是 sr-only，head 取 w-0。
 */
const FARM_BROWSER_SKELETON_COLUMNS: readonly TableSkeletonColumn[] = [
	{ head: "w-10", label: "浏览器", value: "w-2/3", width: "flex-1" },
	{ head: "w-7", label: "版本", value: "w-1/2", width: "flex-1" },
	{ head: "w-7", label: "镜像", value: "w-11/12", width: "flex-1" },
	{ head: "w-0", label: "默认", value: "w-8", width: "w-12 shrink-0" },
	{ head: "w-7", label: "状态", value: "w-1/2", width: "flex-1" },
	{ head: "w-14", label: "更新时间", value: "w-3/4", width: "flex-1" },
	{
		head: "w-0",
		label: "操作",
		value: "w-14",
		width: "flex w-20 shrink-0 justify-end",
	},
];

/**
 * 路由 pendingComponent 用的表格骨架。
 * 行高与真实行（TableCell 的 p-2 + 内容 20px）对齐，数据到达时表格不会长高；
 * 不画表头：与平台用户表那一份同规，凭空补一条会高出 41px。
 */
export function FarmBrowsersTableSkeleton() {
	return (
		<TableSkeleton
			columns={FARM_BROWSER_SKELETON_COLUMNS}
			header={false}
			label="镜像库加载中"
			rows={4}
			spacing="spaced"
		/>
	);
}

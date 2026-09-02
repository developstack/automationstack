/**
 * 节点表的加载骨架，逐条对着 farm-nodes-table.tsx 的表头与行填。
 */
import {
	TableSkeleton,
	type TableSkeletonColumn,
} from "@/components/skeletons/table-skeleton";

/**
 * 真表头没有列宽类，自由文本列一律 flex-1。
 * 「槽位上限」只可能是一两位数字、「启用」只有一个勾选框，两列钉成窄的定宽格
 * （w-20 / w-14）——让它们跟着 flex-1 平分，数据到达那一帧这两列会明显收窄。
 * 行尾三颗图标按钮钉成 w-28 右对齐。「操作」那个表头是 sr-only，head 取 w-0。
 * 头一格是展开箭头（icon-sm，28px）：它与「操作」同样只有 sr-only 表头，钉成
 * w-8 定宽——漏了它的话，数据到达那一帧整张表会整体右移一格。
 */
const FARM_NODE_SKELETON_COLUMNS: readonly TableSkeletonColumn[] = [
	{ head: "w-0", label: "展开", value: "w-4", width: "w-8 shrink-0" },
	{ head: "w-7", label: "名称", value: "w-2/3", width: "flex-1" },
	{ head: "w-7", label: "后端", value: "w-1/2", width: "flex-1" },
	{ head: "w-14", label: "槽位上限", value: "w-6", width: "w-20 shrink-0" },
	{ head: "w-7", label: "在线", value: "w-3/4", width: "flex-1" },
	{ head: "w-7", label: "启用", value: "w-4", width: "w-14 shrink-0" },
	{ head: "w-14", label: "创建时间", value: "w-3/4", width: "flex-1" },
	{
		head: "w-0",
		label: "操作",
		value: "w-20",
		width: "flex w-28 shrink-0 justify-end",
	},
];

/**
 * 路由 pendingComponent 用的表格骨架。
 * 行高与真实行（TableCell 的 p-2 + 内容 20px）对齐，数据到达时表格不会长高；
 * 不画表头：与浏览器目录那一份同规，凭空补一条会高出 41px。
 */
export function FarmNodesTableSkeleton() {
	return (
		<TableSkeleton
			columns={FARM_NODE_SKELETON_COLUMNS}
			header={false}
			label="节点列表加载中"
			rows={4}
			spacing="spaced"
		/>
	);
}

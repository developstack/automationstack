/**
 * Token 表的加载骨架。原与 ApiTokensTable 同住 api-tokens-table.tsx，
 * 按「一个文件一个对外组件」拆开。
 */
import {
	TableSkeleton,
	type TableSkeletonColumn,
} from "@/components/skeletons/table-skeleton";

/**
 * Token 表每一列的骨架形状，逐条对着 api-tokens-table.tsx 里 ApiTokensTable 的
 * 表头与行填。
 * 真表头没有一个列宽类（auto 布局按内容分配），所以自由文本列一律 flex-1，
 * 只把行尾那颗「吊销」按钮钉成 w-20 并右对齐——它是这张表唯一有上界的一格，
 * 也是行高被顶到 h-11 的原因。操作列的表头是 sr-only，head 取 w-0。
 */
const API_TOKEN_SKELETON_COLUMNS: readonly TableSkeletonColumn[] = [
	{ head: "w-10", label: "备注名", value: "w-3/5", width: "flex-1" },
	{ head: "w-7", label: "前缀", value: "w-1/2", width: "flex-1" },
	{ head: "w-7", label: "状态", value: "w-1/2", width: "flex-1" },
	{ head: "w-14", label: "创建时间", value: "w-3/4", width: "flex-1" },
	{ head: "w-14", label: "最后使用", value: "w-3/4", width: "flex-1" },
	{
		head: "w-0",
		label: "操作",
		value: "w-full",
		width: "flex w-20 shrink-0 justify-end",
	},
];

/**
 * 路由 pendingComponent 用的表格骨架。折算法与 case-table-skeleton.tsx 的
 * `CaseTableSkeleton` 同源，逐段对着真身算：
 * - 表头 = TableHead 的 h-10（40px）+ TableHeader 的 `[&_tr]:border-b` 1px
 *   （mb-px）= 41px。原先整条表头没画，等于凭空少 41px；
 * - 数据行 = TableCell 的 p-2（上下各 8px）+ 行内最高的内容 = 44px（h-11）
 *   + TableRow 的 border-b 1px（mt-px）。最高的内容是行尾那颗「吊销」按钮
 *   （ApiTokenRowActions 用的是 size="sm"，h-7 = 28px），不是 Badge 的 h-5。
 * 合起来：三行真身 41 + 3 × 45 = 176px。行与行之间因此也不能留 gap，
 * 边框由 mt-px 自己顶出来——这两档都由 TableSkeleton 的 bordered 给出。
 */
export function ApiTokensTableSkeleton() {
	return (
		<TableSkeleton
			columns={API_TOKEN_SKELETON_COLUMNS}
			label="Token 列表加载中"
			rowHeight="h-11"
			rows={3}
		/>
	);
}

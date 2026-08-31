import {
	TableSkeleton,
	type TableSkeletonColumn,
} from "@/components/skeletons/table-skeleton";

/**
 * 测试任务表每一列的骨架形状，逐条对着 test-run-table.tsx 的 COLUMNS 填。
 * width 与真 `<TableHead className>` 逐字同源（钉宽的补 shrink-0，留空吃剩余
 * 宽度的改写成 flex-1）；head 按列名字数折算；value 是该列真实内容在单元格里
 * 横向占多少——进度与通过率都是短数字，操作列只有一颗图标按钮。
 * 操作列的真表头是 sr-only，视觉上本来就是空的，所以 head 取 w-0。
 */
const TEST_RUN_SKELETON_COLUMNS: readonly TableSkeletonColumn[] = [
	{ head: "w-14", label: "测试任务", value: "w-4/5", width: "flex-1" },
	{ head: "w-7", label: "状态", value: "w-1/2", width: "w-24 shrink-0" },
	{ head: "w-7", label: "进度", value: "w-1/2", width: "w-24 shrink-0" },
	{ head: "w-10", label: "通过率", value: "w-1/2", width: "w-20 shrink-0" },
	{ head: "w-10", label: "创建人", value: "w-1/2", width: "flex-1" },
	{ head: "w-14", label: "创建时间", value: "w-full", width: "w-28 shrink-0" },
	{ head: "w-0", label: "操作", value: "w-8", width: "w-12 shrink-0" },
];

/**
 * 列表首屏骨架，高度按真实表格逐行折算（折算依据同
 * `cases/case-table-skeleton.tsx`：表头 TableHead h-10 + TableHeader 的 1px
 * 下边框；数据行 TableCell p-2 16px + Badge h-5 20px = h-9，再加 1px 边框）。
 * 对不齐的话，数据到达那一帧下方的内容会上下跳一下。高度全部由 TableSkeleton
 * 的 bordered 档给出，这里只描列的形状。
 *
 * 只有表格这一段：TestRunListView 在自己的工具栏与说明文字**下方**用它填表格位
 * （改筛选后重新取数时），那时工具栏已经在屏幕上了，这里再摆一条就成了两条。
 * 路由 pendingComponent 那种「整块 main 都还没有」的场合请用
 * test-run-list-page-skeleton.tsx 里的 TestRunListPageSkeleton。
 */
export function TestRunListSkeleton() {
	return (
		<TableSkeleton
			columns={TEST_RUN_SKELETON_COLUMNS}
			label="测试任务列表加载中"
			rows={5}
		/>
	);
}

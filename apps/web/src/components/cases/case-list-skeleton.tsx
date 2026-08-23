import { Skeleton } from "@automationstack/ui/components/skeleton";

import { CaseTableSkeleton } from "@/components/cases/case-table-states";

/**
 * 工具栏骨架。
 *
 * 为什么非摆不可：工具栏是 main 这列 flex 的第一行，省掉它表格骨架就顶到最上面，
 * 数据到达时整张表要连着 36px 的工具栏加 gap-3 一起往下挪 48px。
 * 同一条工具栏里的控件一律 36px（约定见 case-filters.tsx 顶部），所以这排一律 h-9：
 * 真实 36px vs 骨架 36px，底下的表格不会上下跳。
 * 左右分组照搬 CaseListToolbar 的 justify-between，两端各自贴边；灰条宽度与真实控件
 * 对不齐只会横向差一点，不构成跳动，所以不去逐个控件描它的宽度。
 *
 * 尺寸刻意与 layout/project-shell-skeleton.tsx 里那份保持一致：冷启动进项目时
 * 先显示父路由的骨架、紧接着才轮到这一份，两份宽度不同的话灰条会原地错动一次。
 *
 * aria-hidden 而不是再来一个 output：整块骨架只留 CaseTableSkeleton 自带的那一个
 * 播报区，同一次加载播两遍读屏只会更吵。
 */
function CaseListToolbarSkeleton() {
	return (
		<div
			aria-hidden="true"
			className="flex flex-wrap items-center justify-between gap-2"
		>
			<div className="flex items-center gap-2">
				{/* w-64 与真实搜索框（Input className="w-64"）同宽 */}
				<Skeleton className="h-9 w-64" />
				<Skeleton className="h-9 w-28" />
			</div>
			<div className="flex items-center gap-2">
				<Skeleton className="h-9 w-24" />
				<Skeleton className="h-9 w-28" />
			</div>
		</div>
	);
}

/**
 * 用例列表 main 内部的加载态：工具栏一条 + 表格骨架，与 CaseListView 就绪态的
 * 前两个直接子节点一一对应。
 *
 * 不含 main / PageTransition：那一层由路由的 pendingComponent 给出，和就绪态共用
 * 同一份 CASE_LIST_MAIN，这里只负责 main 里面的东西。
 * 也不摆分页条：它在表格下方，是这一列的最后一个节点，晚到不会把任何东西顶走。
 */
export function CaseListSkeleton() {
	return (
		<>
			<CaseListToolbarSkeleton />
			<CaseTableSkeleton />
		</>
	);
}

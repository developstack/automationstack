import { CASE_PAGE_SIZE } from "@/components/cases/case-list-query";
import { CaseTableSkeleton } from "@/components/cases/case-table-skeleton";
import { ToolbarSkeleton } from "@/components/skeletons/toolbar-skeleton";

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
			{/*
			 * 左组不折行、右组 gap-2，与就绪态的 CaseListToolbar 同款；尺寸刻意与
			 * layout/project-shell-skeleton.tsx 里那处调用保持一致：冷启动进项目时
			 * 先显示父路由的骨架、紧接着才轮到这一份，两份不同的话灰条会原地错动一次。
			 */}
			<ToolbarSkeleton endGap="gap-2" startWrap={false} />
			{/*
			 * 显式写出 CASE_PAGE_SIZE 而不是吃默认值：这里是页面级骨架，等的就是
			 * 整整一页用例，行数与页大小是同一个事实，摆在调用点上那边改了这边
			 * 不会漏。
			 */}
			<CaseTableSkeleton rows={CASE_PAGE_SIZE} />
		</>
	);
}

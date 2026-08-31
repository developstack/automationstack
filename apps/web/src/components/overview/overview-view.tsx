import { PageTransition } from "@/components/layout/page-transition";
import { OverviewChangesCard } from "@/components/overview/overview-changes-card";
import { OverviewCoverageCard } from "@/components/overview/overview-coverage-card";
import { OverviewPriorityCard } from "@/components/overview/overview-priority-card";
import { OverviewStaleCard } from "@/components/overview/overview-stale-card";
import { OverviewTotalsCard } from "@/components/overview/overview-totals-card";

/**
 * 概览页 <main> 的类名。
 *
 * p-4 = 内容区 gutter 16px，与 header 的 px-4、侧栏的 p-2 + px-2 落在同一条线上
 *（约定见 components/workspace/module-tree.tsx 顶部）。路由层不要再在外面套
 * px-*，否则会叠成 32px。
 *
 * 导出而不是就地写死：路由的 pendingComponent 要落在同一份类名上。两处各写一份
 * 迟早会各改各的，而它们之间任何一处差异都会在数据到达那一帧变成跳动。
 *
 * auto-rows-min：不加的话每行会被拉成等高，短卡会跟着同行最高的那张一起拉长，
 * 正文顶在上面留出半张卡的空白。
 */
export const OVERVIEW_MAIN =
	"grid min-h-0 auto-rows-min grid-cols-1 gap-4 overflow-y-auto p-4 lg:grid-cols-2 xl:grid-cols-3";

interface OverviewViewProps {
	projectId: string;
}

/**
 * 项目概览：五张互相独立的卡片。
 *
 * 每张卡自己发查询，而不是在这里取完再逐层传：四条过程本就是后端按「各自
 * loading、各自失效」拆开的，在这里合并成一个大对象只会把它们重新绑死。
 * 数据由路由 loader 预热（见 routes/projects/$projectId/overview.tsx），
 * 所以这些 useSuspenseQuery 落地时都是缓存命中，不会真的挂起。
 *
 * 排列顺序不是需求里的 1..5，而是「读数字的短卡在前 → 读清单的长卡在后」：
 * 栅格按行分配高度，把短卡和长卡混在同一行，短卡下方会空出一大块。
 *
 * phase="ready" 写死：本组件只有一个调用方，就是 /projects/$projectId/overview
 * 的就绪态（同路由的 pendingComponent 标的是 "pending"）。两端成对标注，才不会
 * 在骨架换成真内容那一帧再播一次进场。
 *
 * 五张卡直接摆在栅格里、没有任何逐张错开的包装层，**这是刻意的**：原来每张卡外面
 * 各裹一层 StaggerItem 按 index 依次淡入，整场因此拖到 440ms，已整体删除，
 * 理由见 page-transition.tsx 末尾那节。别再加回来。
 */
export function OverviewView({ projectId }: OverviewViewProps) {
	return (
		<PageTransition className={OVERVIEW_MAIN} phase="ready">
			<OverviewTotalsCard projectId={projectId} />
			<OverviewPriorityCard projectId={projectId} />
			<OverviewCoverageCard projectId={projectId} />
			<OverviewStaleCard projectId={projectId} />
			<OverviewChangesCard projectId={projectId} />
		</PageTransition>
	);
}

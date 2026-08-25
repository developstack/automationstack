import { StaggerItem } from "@/components/layout/page-stagger";
import { PageTransition } from "@/components/layout/page-transition";
import { OverviewAiCard } from "@/components/overview/overview-ai-card";
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
 * auto-rows-min：不加的话每行会被拉成等高，短卡（AI 采纳率）会跟着同行最高的
 * 那张一起拉长，正文顶在上面留出半张卡的空白。
 */
export const OVERVIEW_MAIN =
	"grid min-h-0 auto-rows-min grid-cols-1 gap-4 overflow-y-auto p-4 lg:grid-cols-2 xl:grid-cols-3";

interface OverviewViewProps {
	projectId: string;
}

/**
 * 项目概览：六张互相独立的卡片。
 *
 * 每张卡自己发查询，而不是在这里取完再逐层传：五条过程本就是后端按「各自
 * loading、各自失效」拆开的，在这里合并成一个大对象只会把它们重新绑死。
 * 数据由路由 loader 预热（见 routes/projects/$projectId/overview.tsx），
 * 所以这些 useSuspenseQuery 落地时都是缓存命中，不会真的挂起。
 *
 * 排列顺序不是需求里的 1..6，而是「三张读数字的短卡 → 三张读清单的长卡」：
 * 栅格按行分配高度，把短卡和长卡混在同一行，短卡下方会空出一大块。
 *
 * phase="ready" 写死：本组件只有一个调用方，就是 /projects/$projectId/overview
 * 的就绪态（同路由的 pendingComponent 标的是 "pending"）。两端成对标注，才不会
 * 在骨架换成真内容那一帧再播一次进场。
 *
 * StaggerItem 的 index 就是上面那个阅读顺序：进场时六张卡按这个次序错开出现，
 * 每张差 40ms，最后一张迟 200ms 起步——仍落在 <main> 那 300ms 主进场之内，
 * 读起来是一页在依次落位，不是六张卡各自播一遍。
 *
 * 错不错开完全由 PageTransition 的判定决定（见 page-stagger.tsx）：刷新、
 * 骨架换真内容、以及任何 pathname 没变的页内操作都不会错开，这一页因此不会在
 * 数据刷新时抖成六段。
 *
 * index 手写而不是靠数组下标：这六张卡是写死的排布，摊成数组只是为了拿个序号，
 * 反而把「顺序即阅读顺序」这件事藏进了一次 map。栅格类名不用管——这一页没有
 * col-span，六张卡各占一格；将来若有，类名要写在 StaggerItem 上而不是卡上。
 */
export function OverviewView({ projectId }: OverviewViewProps) {
	return (
		<PageTransition className={OVERVIEW_MAIN} phase="ready">
			<StaggerItem index={0}>
				<OverviewTotalsCard projectId={projectId} />
			</StaggerItem>
			<StaggerItem index={1}>
				<OverviewPriorityCard projectId={projectId} />
			</StaggerItem>
			<StaggerItem index={2}>
				<OverviewAiCard projectId={projectId} />
			</StaggerItem>
			<StaggerItem index={3}>
				<OverviewCoverageCard projectId={projectId} />
			</StaggerItem>
			<StaggerItem index={4}>
				<OverviewStaleCard projectId={projectId} />
			</StaggerItem>
			<StaggerItem index={5}>
				<OverviewChangesCard projectId={projectId} />
			</StaggerItem>
		</PageTransition>
	);
}

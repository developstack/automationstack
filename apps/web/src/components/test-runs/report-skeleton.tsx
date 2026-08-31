import { Skeleton } from "@automationstack/ui/components/skeleton";

import { ReportFailedCasesCardSkeleton } from "@/components/test-runs/report-failed-cases-card-skeleton";
import { ReportModuleCardSkeleton } from "@/components/test-runs/report-module-card-skeleton";
import { ReportPriorityCardSkeleton } from "@/components/test-runs/report-priority-card-skeleton";
import { ReportResultCardSkeleton } from "@/components/test-runs/report-result-card-skeleton";
import { ReportSummaryCardSkeleton } from "@/components/test-runs/report-summary-card-skeleton";

/**
 * 报告页首屏骨架。
 *
 * 换算表沿用 overview-skeleton.tsx 那一份（真实类名 → 骨架高度）：
 *   CardTitle        text-base leading-normal = 24px → h-6
 *   CardDescription  text-sm  leading-normal = 21px → h-5
 *   大号读数          text-3xl                = 36px → h-9
 *   表格行            TableCell 的 p-2 + text-sm ≈ 37px → h-9（TableSkeleton 的 inset 档）
 *   环形图            OverviewDonut 的 h-40 w-40 → <DonutSkeleton />（外框同样 size-40）
 *
 * **刻意不画顶部那条提交条**：它只在「已完成」时才存在，而报告页最常被打开的时刻是
 * 测试中（那时压根没有这条）。给一个多半不会出现的元素占位，等于保证大多数情况下
 * 数据到达那一帧整页往上跳一条的高度。
 *
 * 表格类卡片的行数由数据决定（失败 0..N 条都可能），骨架不可能恒等；
 * 按「行高对齐、条数取中间值」处理——栅格是 auto-rows-min，
 * 伸缩只发生在这张卡自己身上，不会把同行别的卡一起顶动。
 *
 * 每张卡各自一个文件（report-card-skeleton.tsx 是它们共用的外框），
 * 拆开的理由与 eslint `max-lines-per-function`（上限 50 行）、
 * `local/one-component-per-file`（一个文件一个对外组件）两条一起：
 * 骨架每对齐一张真卡就多几行 JSX，而这几段彼此之间没有任何条件或数据往来，
 * 搬走它们不改变渲染结果。
 *
 * ⚠️ 各卡文件里的高度与宽度类名**一个字符都不许改**：上面那张换算表是逐个控件
 * 核算出来的，与就绪态严丝合缝。改一个 h-* 就等于让数据到达那一帧整页跳一下，
 * 而这正是这一组文件存在的唯一理由。每个卡骨架对齐 report-view.tsx 里同名的
 * 那张卡，**下面的引用顺序也必须与那边一致**——栅格按源码顺序排位，错位了
 * 对不上的不只是高度，还有左右两列。
 */

/** 对齐 ReportHeader：面包屑(h-5) + 标题(h-6)。它自己就是 grid item，跨列类名写在这里。 */
function HeadingSkeleton() {
	return (
		<div className="flex items-center gap-3 xl:col-span-3">
			<Skeleton className="h-5 w-24" />
			<Skeleton className="h-6 w-48" />
		</div>
	);
}

/**
 * 这些卡片没有逐项错开的出场次序，**这是刻意的**。
 *
 * 原来每张外面各裹一层 StaggerItem 按 index 依次淡入（序号还刻意与 report-view.tsx
 * 逐个对齐、跳过提交条那一号），整场因此拖到 440ms，已整体删除，理由见
 * page-transition.tsx 末尾那节。现在骨架与真身都只跟着 <main> 整体淡入一次，
 * 两条路（loader 快慢）的观感本来就一致，不再需要那套对齐。
 *
 * 剩下的包装 div 只有栅格占位一个职责：里面几张卡不收 className，跨列类名只能落在
 * 包装层上；`grid` 是为了让 <Card> 跟着包装层一起满高，同一行的卡底边才齐平。
 * 顺序仍必须与 report-view.tsx 逐个一致——栅格按源码顺序排位。
 */
export function ReportSkeleton() {
	return (
		<>
			<HeadingSkeleton />
			<div className="grid xl:col-span-3">
				<ReportSummaryCardSkeleton />
			</div>
			<div className="grid xl:col-span-2">
				<ReportPriorityCardSkeleton />
			</div>
			<ReportResultCardSkeleton />
			<div className="grid xl:col-span-3">
				<ReportModuleCardSkeleton />
			</div>
			<div className="grid xl:col-span-3">
				<ReportFailedCasesCardSkeleton />
			</div>
		</>
	);
}

import {
	Card,
	CardContent,
	CardHeader,
} from "@automationstack/ui/components/card";
import { Skeleton } from "@automationstack/ui/components/skeleton";
import { cn } from "@automationstack/ui/lib/utils";
import { type ReactNode, useEffect } from "react";

/**
 * 概览页首屏骨架：六张卡逐张按真实内容折算高度。
 *
 * 换算表（真实类名 → 骨架高度）：
 *   CardTitle        text-base leading-normal = 24px → h-6
 *   CardDescription  text-sm  leading-normal = 21px → h-5
 *   大号读数          text-3xl                = 36px → h-9（现在只剩陈旧用例卡还在用）
 *   正文行            text-sm                 = 21px → h-5
 *   注脚行            text-xs                 = 16px → h-4
 *   徽章              Badge 的 h-5            = 20px → h-5
 *   环形图            OverviewDonut 的 h-40 w-40 = 160×160px → mx-auto size-40 rounded-full
 *   条形图            OverviewPriorityBars 的 h-32 = 128px → 见 PriorityCardSkeleton
 *
 * 三张卡（用例总数 / 模块覆盖 / AI 采纳率）的大号读数已经挪进环心，那一行 h-9 换成
 * 了 160px 的圆；优先级卡原来那条 h-2 的手搓分布条换成了 128px 的横向条形图。
 * 骨架不跟着改的话，数据到达那一帧这三张卡会各自跳 120~150px。
 *
 * 外框直接复用真的 <Card>/<CardHeader>/<CardContent>，不自己描 py-6 / px-6 / gap：
 * 卡片的内边距与间距写在 --card-spacing 上，抄一份数值出来，那边一改这边就错位。
 * 内层的分组间距也照抄真身（正文块之间 gap-3 由 CardContent 给，块内 gap-1.5 /
 * gap-2 在这里显式写出，与各卡正文里的一致）。
 *
 * 清单类卡片（陈旧用例 / 最近改动）的条数由数据决定，0..10 条都可能，骨架不可能
 * 恒等；这里按「行高逐行对齐、条数取中间值 4」处理——行高对上了，数据到达时也只是
 * 这一张卡自己伸缩，栅格是 auto-rows-min，不会把同行别的卡一起顶动。
 */

let chartChunkRequested = false;

/**
 * 骨架一挂上就把图表 chunk 预取下来。
 *
 * 这里是**这一页唯一一段真正在等的时间**：骨架摆着，说明六条统计的 loader 正在飞，
 * 而两张图的 chunk（recharts，gzip 103KB）与那几个请求互不阻塞，正好并行。等数据
 * 到达再由 lazy() 去取，图区就会先摆一帧空占位——那一帧本来可以不存在。
 *
 * 走动态 import 而不是在文件顶上 import：这个骨架是路由的 pendingComponent，
 * 它自己必须留在首屏 chunk 里。一旦静态引用图表模块，recharts 就跟着回到首屏，
 * 整轮懒加载正好被这一个文件抵消掉——预取要的是「早一点下载」，不是「重新变成
 * 首屏依赖」，两者差的就是这一行是 import() 还是 import。
 *
 * 三张环形卡与优先级卡各取各的 chunk，两个都预。失败不管：真正要画时 lazy()
 * 会自己再试一次（同 use-markdown-field-activation.ts 的处理）。
 */
function preloadChartChunks() {
	if (chartChunkRequested) {
		return;
	}
	chartChunkRequested = true;
	Promise.all([
		import("@/components/overview/overview-donut-chart"),
		import("@/components/overview/overview-priority-bars-chart"),
	]).catch(() => {
		chartChunkRequested = false;
	});
}

const STATUS_ROW_KEYS = ["active", "draft", "deprecated"] as const;
const PRIORITY_KEYS = ["p0", "p1", "p2", "p3"] as const;
const GAP_ROW_KEYS = ["covered", "no-active", "empty"] as const;
const GAP_SAMPLE_KEYS = ["g1", "g2", "g3", "g4", "g5"] as const;
const LIST_ROW_KEYS = ["r1", "r2", "r3", "r4"] as const;

interface CardSkeletonProps {
	children: ReactNode;
	/** 标题灰条的宽度类，按各卡标题的实际字数取。 */
	descriptionWidth: string;
	titleWidth: string;
}

function CardSkeleton({
	children,
	descriptionWidth,
	titleWidth,
}: CardSkeletonProps) {
	return (
		<Card aria-hidden="true">
			<CardHeader>
				<Skeleton className={cn("h-6", titleWidth)} />
				<Skeleton className={cn("h-5", descriptionWidth)} />
			</CardHeader>
			<CardContent>{children}</CardContent>
		</Card>
	);
}

/**
 * 用例总数：环形图 + 三行状态计数（真身的 dl 是 gap-1.5）。
 * 160 + 12（CardContent 的 gap-3）+ 3×20 + 2×6 = 244px，与真身逐段对齐；
 * 中间那句 sr-only 是 position:absolute，不是 flex item，既不占高也不吃 gap。
 */
function TotalsCardSkeleton() {
	return (
		<CardSkeleton descriptionWidth="w-48" titleWidth="w-20">
			<Skeleton className="mx-auto size-40 rounded-full" />
			<div className="flex flex-col gap-1.5">
				{STATUS_ROW_KEYS.map((key) => (
					<Skeleton className="h-5 w-full" key={key} />
				))}
			</div>
		</CardSkeleton>
	);
}

/**
 * 优先级分布：横向条形图 + 四枚图例（真身 gap-x-3 gap-y-2）。
 *
 * 图区几何逐项对齐真身，不拿一个 h-32 的方块糊过去：
 * - 外层 h-32 = 128px，与 OverviewPriorityBars 的 h-32 同值。
 * - 四行 h-4 = 16px，与 BAR_SIZE 同值；justify-around 把 128−4×16=64px 的余量按
 *   8 / 16 / 16 / 16 / 8 分配，四行中线落在 16、48、80、112px——正好是 recharts 把
 *   128px 切成四个 32px 带宽后每一带的中线，柱子位置一格不差。
 * - 左侧 w-6（24px）是 Y 轴刻度文字位，加 gap-1（4px，= TICK_MARGIN）合计 28px，
 *   与 AXIS_WIDTH 同值，柱子起点因此对得上。
 */
function PriorityCardSkeleton() {
	return (
		<CardSkeleton descriptionWidth="w-56" titleWidth="w-24">
			<div className="flex h-32 flex-col justify-around">
				{PRIORITY_KEYS.map((key) => (
					<div className="flex items-center gap-1" key={key}>
						<Skeleton className="h-4 w-6" />
						<Skeleton className="h-4 flex-1" />
					</div>
				))}
			</div>
			<div className="flex flex-wrap gap-x-3 gap-y-2">
				{PRIORITY_KEYS.map((key) => (
					<Skeleton className="h-5 w-20" key={key} />
				))}
			</div>
		</CardSkeleton>
	);
}

/**
 * AI 采纳率：进度环 + 一行说明。160 + 12 + 20 = 192px。
 * 环与另外两张同尺寸（h-40 w-40），三张卡的圆在栅格里是同一个大小。
 */
function AiCardSkeleton() {
	return (
		<CardSkeleton descriptionWidth="w-56" titleWidth="w-24">
			<Skeleton className="mx-auto size-40 rounded-full" />
			<Skeleton className="h-5 w-48" />
		</CardSkeleton>
	);
}

/**
 * 覆盖缺口：环形图 + 三行计数 + 点名清单。
 * 计数行从两行变三行：环上多了「有生效用例」这一段，图例必须把三段都列全。
 * 160 + 12 + (3×20+2×6) + 12 + (1px 分隔线 + pt-3 12px + 5×20 + 4×6) = 393px。
 */
function CoverageCardSkeleton() {
	return (
		<CardSkeleton descriptionWidth="w-64" titleWidth="w-28">
			<Skeleton className="mx-auto size-40 rounded-full" />
			<div className="flex flex-col gap-1.5">
				{GAP_ROW_KEYS.map((key) => (
					<Skeleton className="h-5 w-full" key={key} />
				))}
			</div>
			{/* border-t pt-3 与真身那条分隔线对齐，否则清单整体上移 13px */}
			<div className="flex flex-col gap-1.5 border-t pt-3">
				{GAP_SAMPLE_KEYS.map((key) => (
					<Skeleton className="h-5 w-full" key={key} />
				))}
			</div>
		</CardSkeleton>
	);
}

/** 陈旧高优：大号计数 + 清单（每行 = 徽章 h-5 与文字同高）。 */
function StaleCardSkeleton() {
	return (
		<CardSkeleton descriptionWidth="w-64" titleWidth="w-32">
			<Skeleton className="h-9 w-12" />
			<div className="flex flex-col gap-1.5">
				{LIST_ROW_KEYS.map((key) => (
					<Skeleton className="h-5 w-full" key={key} />
				))}
			</div>
		</CardSkeleton>
	);
}

/** 最近改动：每条两行（标题 h-5 + 注脚 h-4，行内 gap-0.5，条间 gap-2）。 */
function ChangesCardSkeleton() {
	return (
		<CardSkeleton descriptionWidth="w-56" titleWidth="w-20">
			<div className="flex flex-col gap-2">
				{LIST_ROW_KEYS.map((key) => (
					<div className="flex flex-col gap-0.5" key={key}>
						<Skeleton className="h-5 w-full" />
						<Skeleton className="h-4 w-3/4" />
					</div>
				))}
			</div>
		</CardSkeleton>
	);
}

/**
 * main 里面的东西，不含 main / PageTransition：那一层由路由的 pendingComponent
 * 给出，与就绪态共用同一份 OVERVIEW_MAIN。
 *
 * 六张卡各自 aria-hidden，播报只留下面这一个 output：同一次加载播六遍读屏只会更吵。
 * output 带 sr-only，脱离文档流，不占栅格里的一格。
 */
export function OverviewSkeleton() {
	useEffect(() => preloadChartChunks(), []);

	return (
		<>
			<output aria-busy="true" className="sr-only">
				项目概览加载中
			</output>
			<TotalsCardSkeleton />
			<PriorityCardSkeleton />
			<AiCardSkeleton />
			<CoverageCardSkeleton />
			<StaleCardSkeleton />
			<ChangesCardSkeleton />
		</>
	);
}

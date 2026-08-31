/**
 * 「优先级分布」卡的骨架。原是 overview-skeleton.tsx 里的私有辅助，
 * 按「同文件最多 2 个私有辅助组件」拆出来；换算表仍在 overview-skeleton.tsx 顶部。
 */
import { Skeleton } from "@automationstack/ui/components/skeleton";

import { CardSkeleton } from "@/components/overview/card-skeleton";

const PRIORITY_KEYS = ["p0", "p1", "p2", "p3"] as const;

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
export function PriorityCardSkeleton() {
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

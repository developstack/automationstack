/**
 * 「模块覆盖缺口」卡的骨架。原是 overview-skeleton.tsx 里的私有辅助，
 * 按「同文件最多 2 个私有辅助组件」拆出来；换算表仍在 overview-skeleton.tsx 顶部。
 */
import { Skeleton } from "@automationstack/ui/components/skeleton";

import { CardSkeleton } from "@/components/overview/card-skeleton";
import { DonutSkeleton } from "@/components/skeletons/donut-skeleton";

const GAP_ROW_KEYS = ["covered", "no-active", "empty"] as const;
const GAP_SAMPLE_KEYS = ["g1", "g2", "g3", "g4", "g5"] as const;

/**
 * 覆盖缺口：环形图 + 三行计数 + 点名清单。
 * 计数行从两行变三行：环上多了「有生效用例」这一段，图例必须把三段都列全。
 * 160 + 12 + (3×20+2×6) + 12 + (1px 分隔线 + pt-3 12px + 5×20 + 4×6) = 393px。
 */
export function CoverageCardSkeleton() {
	return (
		<CardSkeleton descriptionWidth="w-64" titleWidth="w-28">
			<DonutSkeleton />
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

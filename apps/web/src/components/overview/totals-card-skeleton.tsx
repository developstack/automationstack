/**
 * 「用例总数」卡的骨架。原是 overview-skeleton.tsx 里的私有辅助，
 * 按「同文件最多 2 个私有辅助组件」拆出来；换算表仍在 overview-skeleton.tsx 顶部。
 */
import { Skeleton } from "@automationstack/ui/components/skeleton";

import { CardSkeleton } from "@/components/overview/card-skeleton";
import { DonutSkeleton } from "@/components/skeletons/donut-skeleton";

const STATUS_ROW_KEYS = ["active", "draft", "deprecated"] as const;

/**
 * 用例总数：环形图 + 三行状态计数（真身的 dl 是 gap-1.5）。
 * 160 + 12（CardContent 的 gap-3）+ 3×20 + 2×6 = 244px，与真身逐段对齐；
 * 中间那句 sr-only 是 position:absolute，不是 flex item，既不占高也不吃 gap。
 */
export function TotalsCardSkeleton() {
	return (
		<CardSkeleton descriptionWidth="w-48" titleWidth="w-20">
			<DonutSkeleton />
			<div className="flex flex-col gap-1.5">
				{STATUS_ROW_KEYS.map((key) => (
					<Skeleton className="h-5 w-full" key={key} />
				))}
			</div>
		</CardSkeleton>
	);
}

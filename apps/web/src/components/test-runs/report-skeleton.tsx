import {
	Card,
	CardContent,
	CardHeader,
} from "@automationstack/ui/components/card";
import { Skeleton } from "@automationstack/ui/components/skeleton";
import type { ReactNode } from "react";

/**
 * 报告页首屏骨架。
 *
 * 换算表沿用 overview-skeleton.tsx 那一份（真实类名 → 骨架高度）：
 *   CardTitle        text-base leading-normal = 24px → h-6
 *   CardDescription  text-sm  leading-normal = 21px → h-5
 *   大号读数          text-3xl                = 36px → h-9
 *   表格行            TableCell 的 p-2 + text-sm ≈ 37px → h-9
 *   环形图            OverviewDonut 的 h-40 w-40 → mx-auto size-40 rounded-full
 *
 * **刻意不画顶部那条提交条**：它只在「已完成」时才存在，而报告页最常被打开的时刻是
 * 测试中（那时压根没有这条）。给一个多半不会出现的元素占位，等于保证大多数情况下
 * 数据到达那一帧整页往上跳一条的高度。
 *
 * 外框直接复用真的 <Card>：卡片的内边距与间距写在 --card-spacing 上，
 * 抄一份数值出来那边一改这边就错位。
 *
 * 表格类卡片的行数由数据决定（失败 0..N 条都可能），骨架不可能恒等；
 * 按「行高对齐、条数取中间值」处理——栅格是 auto-rows-min，
 * 伸缩只发生在这张卡自己身上，不会把同行别的卡一起顶动。
 */

const SUMMARY_STAT_KEYS = ["total", "passed", "failed", "blocked"] as const;
const RATE_KEYS = ["completion", "pass"] as const;
const PRIORITY_ROW_KEYS = ["p0", "p1", "p2", "p3"] as const;
const LEGEND_ROW_KEYS = ["l1", "l2", "l3", "l4", "l5"] as const;
const MODULE_ROW_KEYS = ["m1", "m2", "m3", "m4"] as const;
const FAILED_ROW_KEYS = ["f1", "f2", "f3", "f4"] as const;

interface CardSkeletonProps {
	children: ReactNode;
	className?: string;
	/** 描述灰条的宽度类，按各卡描述的实际字数取。 */
	descriptionWidth: string;
	titleWidth: string;
}

function CardSkeleton({
	children,
	className,
	descriptionWidth,
	titleWidth,
}: CardSkeletonProps) {
	return (
		<Card className={className}>
			<CardHeader>
				<Skeleton className={`h-6 ${titleWidth}`} />
				<Skeleton className={`h-5 ${descriptionWidth}`} />
			</CardHeader>
			<CardContent>{children}</CardContent>
		</Card>
	);
}

/** 一行大读数：标签(h-5) + 数字(h-9) + 口径注脚(h-4)，与 ReportStat 逐行对齐。 */
function StatSkeleton() {
	return (
		<div className="flex flex-col gap-0.5">
			<Skeleton className="h-5 w-16" />
			<Skeleton className="h-9 w-20" />
			<Skeleton className="h-4 w-full" />
		</div>
	);
}

function TableRowsSkeleton({ keys }: { keys: readonly string[] }) {
	return (
		<div className="flex flex-col">
			{keys.map((key) => (
				<Skeleton className="my-1 h-9 w-full" key={key} />
			))}
		</div>
	);
}

export function ReportSkeleton() {
	return (
		<>
			<div className="flex items-center gap-3 xl:col-span-3">
				<Skeleton className="h-5 w-24" />
				<Skeleton className="h-6 w-48" />
			</div>

			<CardSkeleton
				className="xl:col-span-3"
				descriptionWidth="w-96"
				titleWidth="w-24"
			>
				<div className="grid grid-cols-2 gap-4 md:grid-cols-4">
					{SUMMARY_STAT_KEYS.map((key) => (
						<StatSkeleton key={key} />
					))}
				</div>
				<Skeleton className="h-px w-full" />
				<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
					{RATE_KEYS.map((key) => (
						<StatSkeleton key={key} />
					))}
				</div>
			</CardSkeleton>

			<CardSkeleton
				className="xl:col-span-2"
				descriptionWidth="w-80"
				titleWidth="w-36"
			>
				{/* P0 结论条：px-3 py-2 + text-sm 一行 ≈ 37px */}
				<Skeleton className="h-9 w-full" />
				<TableRowsSkeleton keys={PRIORITY_ROW_KEYS} />
			</CardSkeleton>

			<CardSkeleton descriptionWidth="w-56" titleWidth="w-20">
				<Skeleton className="mx-auto size-40 rounded-full" />
				<div className="flex flex-col gap-1.5">
					{LEGEND_ROW_KEYS.map((key) => (
						<Skeleton className="h-5 w-full" key={key} />
					))}
				</div>
			</CardSkeleton>

			<CardSkeleton
				className="xl:col-span-3"
				descriptionWidth="w-72"
				titleWidth="w-40"
			>
				<TableRowsSkeleton keys={MODULE_ROW_KEYS} />
			</CardSkeleton>

			<CardSkeleton
				className="xl:col-span-3"
				descriptionWidth="w-96"
				titleWidth="w-28"
			>
				<TableRowsSkeleton keys={FAILED_ROW_KEYS} />
			</CardSkeleton>
		</>
	);
}

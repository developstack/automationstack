/**
 * 优先级条形图的懒加载壳，真身在 overview-priority-bars-chart.tsx。
 *
 * 为什么要这一层、以及 SSR 下为何只用 Suspense 不加 ClientOnly，见
 * overview-donut.tsx 的头注释——那边写的是同一件事，两张图共用一套结论。
 *
 * 占位与真身等高（OVERVIEW_BARS_BOX 两边共用），理由见 chart-box.ts。
 */
import { lazy, Suspense } from "react";

import { OVERVIEW_BARS_BOX } from "@/components/overview/chart-box";
import type { OverviewPriorityBarsProps } from "@/components/overview/overview-priority-bars-chart";

const LazyOverviewPriorityBarsChart = lazy(async () => {
	const chartModule = await import(
		"@/components/overview/overview-priority-bars-chart"
	);
	return { default: chartModule.OverviewPriorityBarsChart };
});

/**
 * chunk 到达前的占位：与图区等高的一块空白。
 *
 * 刻意不在这里复刻 overview-skeleton.tsx 里那套「四条灰条」——那一份是**数据**还没到
 * 时的骨架，这一份是数据已经在手上、只差画图的 chunk。两者叠着出现会让同一张卡连着
 * 换两次样子（灰条 → 另一种灰条 → 真图）。空白只补高度，不多说一句话。
 */
const BARS_FALLBACK = <div aria-hidden="true" className={OVERVIEW_BARS_BOX} />;

export function OverviewPriorityBars(props: OverviewPriorityBarsProps) {
	return (
		<Suspense fallback={BARS_FALLBACK}>
			<LazyOverviewPriorityBarsChart {...props} />
		</Suspense>
	);
}

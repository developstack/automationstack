import { useReducedMotion } from "motion/react";

import { formatTrendRange } from "@/components/overview/overview-metrics";

/** M4 环形进度图的两个环。颜色只表示状态，所以用两级灰度。 */
export const COVERAGE_RING_COLORS = {
	all: "var(--chart-5)",
	high: "var(--chart-3)",
} as const;

export const CHART_SEAM = { stroke: "var(--card)", strokeWidth: 2 } as const;

export const CHART_ANIMATION = {
	animationDuration: 400,
	animationEasing: "ease-out",
} as const;

export function useChartAnimation(): boolean {
	return useReducedMotion() !== true;
}

const RANGE_SEPARATOR = "–";

/** 横轴只显示区间的开始日期；Tooltip 显示整个区间。 */
function trendTick(range: string): string {
	return range.split(RANGE_SEPARATOR)[0] ?? range;
}

export const TREND_MARGIN = { bottom: 0, left: 4, right: 4, top: 8 } as const;

export const TREND_X_AXIS_PROPS = {
	axisLine: false,
	dataKey: "range",
	interval: "preserveStartEnd",
	minTickGap: 16,
	tickFormatter: trendTick,
	tickLine: false,
	tickMargin: 8,
} as const;

export const TREND_Y_AXIS_PROPS = {
	allowDecimals: false,
	axisLine: false,
	tickLine: false,
	tickMargin: 4,
	width: 32,
} as const;

interface TrendWindow {
	end: Date | string;
	start: Date | string;
}

/** 趋势图的数据行：加上区间文字，横轴和 Tooltip 都用它。 */
export function toTrendRows<T extends TrendWindow>(
	points: readonly T[]
): (T & { range: string })[] {
	return points.map((point) => ({
		...point,
		range: formatTrendRange(point.start, point.end),
	}));
}

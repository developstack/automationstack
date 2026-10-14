import type { RunTrendPoint } from "@automationstack/db/repositories/project-stats-trend-core";
import {
	type ChartConfig,
	ChartContainer,
	ChartLegend,
	ChartLegendContent,
	ChartTooltip,
	ChartTooltipContent,
} from "@automationstack/ui/components/chart";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";

import {
	CHART_ANIMATION,
	TREND_MARGIN,
	TREND_X_AXIS_PROPS,
	TREND_Y_AXIS_PROPS,
	toTrendRows,
	useChartAnimation,
} from "@/components/overview/overview-chart";
import { STACKED_CHART_BOX } from "@/components/overview/overview-layout";

// 颜色只表示状态，所以两条线用两级灰度区分，新建的线再加虚线
const CHART_CONFIG = {
	completed: { color: "var(--chart-5)", label: "完成" },
	created: { color: "var(--chart-2)", label: "新建" },
} satisfies ChartConfig;

const DASHED = "4 4";
const DOT_RADIUS = 3;

interface RunTrendChartProps {
	points: readonly RunTrendPoint[];
}

/** M7：两条折线，比较每个 7 天区间新建和完成的测试任务数。 */
export function RunTrendChart({ points }: RunTrendChartProps) {
	const animate = useChartAnimation();

	return (
		<ChartContainer
			aria-hidden="true"
			className={STACKED_CHART_BOX}
			config={CHART_CONFIG}
		>
			<LineChart
				data={toTrendRows(points)}
				margin={TREND_MARGIN}
				role="presentation"
				tabIndex={-1}
			>
				<CartesianGrid vertical={false} />
				<XAxis {...TREND_X_AXIS_PROPS} />
				<YAxis {...TREND_Y_AXIS_PROPS} />
				<ChartTooltip content={<ChartTooltipContent />} cursor={false} />
				<ChartLegend content={<ChartLegendContent />} />
				<Line
					{...CHART_ANIMATION}
					dataKey="created"
					dot={{ r: DOT_RADIUS }}
					isAnimationActive={animate}
					stroke="var(--color-created)"
					strokeDasharray={DASHED}
					strokeWidth={2}
					type="linear"
				/>
				<Line
					{...CHART_ANIMATION}
					dataKey="completed"
					dot={{ r: DOT_RADIUS }}
					isAnimationActive={animate}
					stroke="var(--color-completed)"
					strokeWidth={2}
					type="linear"
				/>
			</LineChart>
		</ChartContainer>
	);
}

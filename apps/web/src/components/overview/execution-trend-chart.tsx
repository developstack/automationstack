import type { ConcludedResult } from "@automationstack/db/repositories/project-stats-definitions";
import { CONCLUDED_RESULTS } from "@automationstack/db/repositories/project-stats-definitions";
import type { ExecutionTrendPoint } from "@automationstack/db/repositories/project-stats-trend-core";
import {
	type ChartConfig,
	ChartContainer,
	ChartLegend,
	ChartLegendContent,
	ChartTooltip,
	ChartTooltipContent,
} from "@automationstack/ui/components/chart";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

import {
	CHART_ANIMATION,
	CHART_SEAM,
	TREND_MARGIN,
	TREND_X_AXIS_PROPS,
	TREND_Y_AXIS_PROPS,
	toTrendRows,
	useChartAnimation,
} from "@/components/overview/overview-chart";
import { STACKED_CHART_BOX } from "@/components/overview/overview-layout";
import { RESULT_CHART_COLORS } from "@/components/test-runs/report-meta";
import { RESULT_LABELS } from "@/components/test-runs/test-run-meta";

const CHART_CONFIG: ChartConfig = Object.fromEntries(
	CONCLUDED_RESULTS.map((result) => [
		result,
		{ color: RESULT_CHART_COLORS[result].color, label: RESULT_LABELS[result] },
	])
);

const STACK_ID = "results";
const BAR_RADIUS = 4;
const BAR_SIZE = 20;
const NO_RADIUS: [number, number, number, number] = [0, 0, 0, 0];
const TOP_RADIUS: [number, number, number, number] = [
	BAR_RADIUS,
	BAR_RADIUS,
	0,
	0,
];

function radiusOf(result: ConcludedResult) {
	return result === CONCLUDED_RESULTS.at(-1) ? TOP_RADIUS : NO_RADIUS;
}

interface ExecutionTrendChartProps {
	points: readonly ExecutionTrendPoint[];
}

/** M6：堆叠柱状图。柱子的高度是工作量，分段是执行结果。 */
export function ExecutionTrendChart({ points }: ExecutionTrendChartProps) {
	const animate = useChartAnimation();

	return (
		<ChartContainer
			aria-hidden="true"
			className={STACKED_CHART_BOX}
			config={CHART_CONFIG}
		>
			<BarChart
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
				{CONCLUDED_RESULTS.map((result) => (
					<Bar
						{...CHART_ANIMATION}
						dataKey={result}
						fill={`var(--color-${result})`}
						isAnimationActive={animate}
						key={result}
						maxBarSize={BAR_SIZE}
						radius={radiusOf(result)}
						stackId={STACK_ID}
						stroke={CHART_SEAM.stroke}
						strokeWidth={CHART_SEAM.strokeWidth}
					/>
				))}
			</BarChart>
		</ChartContainer>
	);
}

import type { CasePriority } from "@automationstack/db/schema/test-cases";
import {
	type ChartConfig,
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from "@automationstack/ui/components/chart";
import { Bar, BarChart, Cell, XAxis, YAxis } from "recharts";

import { PRIORITY_VALUES } from "@/components/cases/case-meta";
import { OVERVIEW_BARS_BOX } from "@/components/overview/chart-box";
import {
	CHART_ANIMATION,
	CHART_SEAM,
	useChartAnimation,
} from "@/components/overview/overview-chart";

const PRIORITY_COLORS: Record<CasePriority, string> = {
	P0: "var(--priority-0)",
	P1: "var(--priority-1)",
	P2: "var(--priority-2)",
	P3: "var(--priority-3)",
};

const CHART_CONFIG: ChartConfig = { count: { label: "用例数" } };
const BAR_MARGIN = { bottom: 0, left: 0, right: 0, top: 0 };
const BAR_SIZE = 16;
const BAR_RADIUS = 4;
const AXIS_WIDTH = 28;
const TICK_MARGIN = 4;

const Y_AXIS_PROPS = {
	axisLine: false,
	dataKey: "priority",
	tickLine: false,
	tickMargin: TICK_MARGIN,
	type: "category",
	width: AXIS_WIDTH,
} as const;

function buildRows(counts: Record<CasePriority, number>) {
	return PRIORITY_VALUES.map((priority) => ({
		count: counts[priority],
		priority,
	}));
}

export interface OverviewPriorityBarsProps {
	counts: Record<CasePriority, number>;
	total: number;
}

export function OverviewPriorityBarsChart({
	counts,
	total,
}: OverviewPriorityBarsProps) {
	const animate = useChartAnimation();
	const rows = buildRows(counts);

	return (
		<ChartContainer
			aria-hidden="true"
			className={OVERVIEW_BARS_BOX}
			config={CHART_CONFIG}
		>
			<BarChart
				data={rows}
				layout="vertical"
				margin={BAR_MARGIN}
				role="presentation"
				tabIndex={-1}
			>
				<XAxis domain={[0, total]} hide type="number" />
				<YAxis {...Y_AXIS_PROPS} />
				<ChartTooltip content={<ChartTooltipContent />} cursor={false} />
				<Bar
					{...CHART_ANIMATION}
					background={{ fill: "var(--chart-1)", radius: BAR_RADIUS }}
					barSize={BAR_SIZE}
					dataKey="count"
					isAnimationActive={animate}
					radius={BAR_RADIUS}
					stroke={CHART_SEAM.stroke}
					strokeWidth={CHART_SEAM.strokeWidth}
				>
					{rows.map((row) => (
						<Cell fill={PRIORITY_COLORS[row.priority]} key={row.priority} />
					))}
				</Bar>
			</BarChart>
		</ChartContainer>
	);
}

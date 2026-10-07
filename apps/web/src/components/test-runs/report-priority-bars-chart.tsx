import type { CasePriority } from "@automationstack/db/schema/test-cases";
import {
	type ChartConfig,
	ChartContainer,
} from "@automationstack/ui/components/chart";
import { Bar, BarChart, Cell, XAxis, YAxis } from "recharts";

import { REPORT_BARS_BOX } from "@/components/overview/chart-box";
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

const CHART_CONFIG: ChartConfig = { passRate: { label: "通过率" } };
const BAR_MARGIN = { bottom: 0, left: 0, right: 0, top: 0 };
const BAR_SIZE = 16;
const BAR_RADIUS = 4;
const AXIS_WIDTH = 28;
const RATE_DOMAIN = [0, 1] as const;

const Y_AXIS_PROPS = {
	axisLine: false,
	dataKey: "priority",
	tickLine: false,
	tickMargin: 4,
	type: "category",
	width: AXIS_WIDTH,
} as const;

export interface ReportPriorityBarsProps {
	heightPx: number;
	rows: readonly { passRate: number; priority: CasePriority }[];
}

export function ReportPriorityBarsChart({
	heightPx,
	rows,
}: ReportPriorityBarsProps) {
	const animate = useChartAnimation();
	return (
		<ChartContainer
			aria-hidden="true"
			className={REPORT_BARS_BOX}
			config={CHART_CONFIG}
			style={{ height: `${heightPx}px` }}
		>
			<BarChart
				data={[...rows]}
				layout="vertical"
				margin={BAR_MARGIN}
				role="presentation"
				tabIndex={-1}
			>
				<XAxis domain={[...RATE_DOMAIN]} hide type="number" />
				<YAxis {...Y_AXIS_PROPS} />
				<Bar
					{...CHART_ANIMATION}
					background={{ fill: "var(--chart-1)", radius: BAR_RADIUS }}
					barSize={BAR_SIZE}
					dataKey="passRate"
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

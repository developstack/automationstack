import {
	type ChartConfig,
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from "@automationstack/ui/components/chart";
import { Bar, BarChart, XAxis, YAxis } from "recharts";

import { REPORT_BARS_BOX } from "@/components/overview/chart-box";
import {
	CHART_ANIMATION,
	CHART_SEAM,
	useChartAnimation,
} from "@/components/overview/overview-chart";
import {
	RESULT_CHART_COLORS,
	type ReportModuleStat,
} from "@/components/test-runs/report-meta";

const CHART_CONFIG: ChartConfig = {
	failed: { label: "失败" },
	passed: { label: "通过" },
} satisfies ChartConfig;

const BAR_MARGIN = { bottom: 0, left: 0, right: 0, top: 0 };
const BAR_SIZE = 10;
const BAR_RADIUS = 3;
const MAX_TICK_CHARS = 7;

function truncateModuleName(value: string): string {
	if (value.length <= MAX_TICK_CHARS) {
		return value;
	}
	return `${value.slice(0, MAX_TICK_CHARS)}…`;
}

const X_AXIS_PROPS = {
	axisLine: false,
	dataKey: "moduleName",
	tickFormatter: truncateModuleName,
	tickLine: false,
	tickMargin: 4,
	type: "category",
} as const;

const Y_AXIS_PROPS = {
	allowDecimals: false,
	axisLine: false,
	tickLine: false,
	tickMargin: 4,
	type: "number",
} as const;

export interface ReportModuleBarsProps {
	heightPx: number;
	rows: readonly ReportModuleStat[];
}

export function ReportModuleBarsChart({
	heightPx,
	rows,
}: ReportModuleBarsProps) {
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
				margin={BAR_MARGIN}
				role="presentation"
				tabIndex={-1}
			>
				<XAxis {...X_AXIS_PROPS} />
				<YAxis {...Y_AXIS_PROPS} />
				<ChartTooltip content={<ChartTooltipContent />} cursor={false} />
				<Bar
					{...CHART_ANIMATION}
					dataKey="passed"
					fill={RESULT_CHART_COLORS.passed.color}
					isAnimationActive={animate}
					maxBarSize={BAR_SIZE}
					radius={BAR_RADIUS}
					stroke={CHART_SEAM.stroke}
					strokeWidth={CHART_SEAM.strokeWidth}
				/>
				<Bar
					{...CHART_ANIMATION}
					dataKey="failed"
					fill={RESULT_CHART_COLORS.failed.color}
					isAnimationActive={animate}
					maxBarSize={BAR_SIZE}
					radius={BAR_RADIUS}
					stroke={CHART_SEAM.stroke}
					strokeWidth={CHART_SEAM.strokeWidth}
				/>
			</BarChart>
		</ChartContainer>
	);
}

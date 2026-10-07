import {
	type ChartConfig,
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from "@automationstack/ui/components/chart";
import { Label, Pie, PieChart } from "recharts";

import { DONUT_BOX } from "@/components/overview/chart-box";
import {
	CHART_ANIMATION,
	CHART_SEAM,
	useChartAnimation,
} from "@/components/overview/overview-chart";

const OUTER_RADIUS = 76;
const INNER_RADIUS = 52;
const VALUE_DY = -8;
const LABEL_DY = 16;
const PIE_MARGIN = { bottom: 0, left: 0, right: 0, top: 0 };
const TRACK_KEY = "__track";

export interface DonutSlice {
	color: string;
	key: string;
	label: string;
	value: number;
}

interface DonutCenterProps {
	label: string;
	value: string;
	viewBox?: { cx?: number | string; cy?: number | string };
}

function DonutCenter({ label, value, viewBox }: DonutCenterProps) {
	const cx = viewBox?.cx;
	const cy = viewBox?.cy;
	if (typeof cx !== "number" || typeof cy !== "number") {
		return null;
	}

	return (
		<text dominantBaseline="middle" textAnchor="middle" x={cx} y={cy}>
			<tspan
				className="fill-foreground font-semibold text-3xl tabular-nums"
				x={cx}
				y={cy + VALUE_DY}
			>
				{value}
			</tspan>
			<tspan className="fill-muted-foreground text-xs" x={cx} y={cy + LABEL_DY}>
				{label}
			</tspan>
		</text>
	);
}

export interface OverviewDonutProps {
	centerLabel: string;
	centerValue: string;
	showTooltip?: boolean;
	slices: readonly DonutSlice[];
	trackValue?: number;
}

function buildChartConfig(slices: readonly DonutSlice[]): ChartConfig {
	return Object.fromEntries(
		slices.map((slice) => [slice.key, { label: slice.label }])
	);
}

function buildPieData(slices: readonly DonutSlice[], trackValue: number) {
	const data = slices
		.filter((slice) => slice.value > 0)
		.map((slice) => ({
			fill: slice.color,
			key: slice.key,
			value: slice.value,
		}));
	const track =
		trackValue > 0
			? [{ fill: "var(--chart-1)", key: TRACK_KEY, value: trackValue }]
			: [];
	return [...data, ...track];
}

export function OverviewDonutChart({
	centerLabel,
	centerValue,
	showTooltip = true,
	slices,
	trackValue = 0,
}: OverviewDonutProps) {
	const animate = useChartAnimation();
	const config = buildChartConfig(slices);
	const data = buildPieData(slices, trackValue);

	return (
		<ChartContainer aria-hidden="true" className={DONUT_BOX} config={config}>
			<PieChart margin={PIE_MARGIN} role="presentation" tabIndex={-1}>
				{showTooltip ? (
					<ChartTooltip
						content={<ChartTooltipContent hideLabel nameKey="key" />}
						cursor={false}
					/>
				) : null}
				<Pie
					{...CHART_ANIMATION}
					data={data}
					dataKey="value"
					innerRadius={INNER_RADIUS}
					isAnimationActive={animate}
					nameKey="key"
					outerRadius={OUTER_RADIUS}
					stroke={CHART_SEAM.stroke}
					strokeWidth={CHART_SEAM.strokeWidth}
				>
					<Label
						content={<DonutCenter label={centerLabel} value={centerValue} />}
					/>
				</Pie>
			</PieChart>
		</ChartContainer>
	);
}

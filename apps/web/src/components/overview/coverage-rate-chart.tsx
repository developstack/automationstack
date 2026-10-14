import {
	type ChartConfig,
	ChartContainer,
} from "@automationstack/ui/components/chart";
import { Label, PolarAngleAxis, RadialBar, RadialBarChart } from "recharts";
import { DONUT_BOX } from "@/components/overview/chart-box";
import {
	CHART_ANIMATION,
	COVERAGE_RING_COLORS,
	useChartAnimation,
} from "@/components/overview/overview-chart";

const CHART_CONFIG = {
	all: { color: COVERAGE_RING_COLORS.all, label: "全部生效用例" },
	high: { color: COVERAGE_RING_COLORS.high, label: "P0/P1 生效用例" },
} satisfies ChartConfig;

const FULL_PERCENT = 100;
const PERCENT_DOMAIN: [number, number] = [0, FULL_PERCENT];
const START_ANGLE = 90;
const END_ANGLE = -270;
const INNER_RADIUS = 46;
const OUTER_RADIUS = 78;
const BAR_SIZE = 12;
const BAR_CORNER_RADIUS = 6;
const VALUE_DY = -6;
const LABEL_DY = 14;
const CHART_MARGIN = { bottom: 0, left: 0, right: 0, top: 0 };

interface CenterProps {
	label: string;
	value: string;
	viewBox?: { cx?: number | string; cy?: number | string };
}

function RateCenter({ label, value, viewBox }: CenterProps) {
	const cx = viewBox?.cx;
	const cy = viewBox?.cy;
	if (typeof cx !== "number" || typeof cy !== "number") {
		return null;
	}
	return (
		<text dominantBaseline="middle" textAnchor="middle" x={cx} y={cy}>
			<tspan
				className="fill-foreground font-semibold text-2xl tabular-nums"
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

interface CoverageRateChartProps {
	/** 全部生效用例的执行覆盖率（0–100），画在外环，也显示在中心。 */
	allPercent: number;
	/** P0/P1 生效用例的执行覆盖率（0–100），画在内环。 */
	highPercent: number;
}

/** M4：两个环的环形进度图。百分比和条数在旁边的图例中，所以图对屏幕阅读器隐藏。 */
export function CoverageRateChart({
	allPercent,
	highPercent,
}: CoverageRateChartProps) {
	const animate = useChartAnimation();
	// RadialBarChart 的第一行画在最里面
	const data = [
		{ fill: "var(--color-high)", key: "high", value: highPercent },
		{ fill: "var(--color-all)", key: "all", value: allPercent },
	];

	return (
		<ChartContainer
			aria-hidden="true"
			className={DONUT_BOX}
			config={CHART_CONFIG}
		>
			<RadialBarChart
				barSize={BAR_SIZE}
				data={data}
				endAngle={END_ANGLE}
				innerRadius={INNER_RADIUS}
				margin={CHART_MARGIN}
				outerRadius={OUTER_RADIUS}
				role="presentation"
				startAngle={START_ANGLE}
				tabIndex={-1}
			>
				<PolarAngleAxis domain={PERCENT_DOMAIN} tick={false} type="number" />
				<RadialBar
					{...CHART_ANIMATION}
					background={{ fill: "var(--muted)" }}
					cornerRadius={BAR_CORNER_RADIUS}
					dataKey="value"
					isAnimationActive={animate}
				>
					<Label
						content={<RateCenter label="已执行" value={`${allPercent}%`} />}
						position="center"
					/>
				</RadialBar>
			</RadialBarChart>
		</ChartContainer>
	);
}

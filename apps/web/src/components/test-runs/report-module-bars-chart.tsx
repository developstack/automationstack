/**
 * 报告页「按模块的通过与失败」竖柱图的真身。**只能经由 report-module-card.tsx 的动态
 * import 进来**，理由（recharts 会被提回入口 chunk）见 overview-donut.tsx 的头注释。
 */
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
/**
 * 每根柱子的最大宽度（maxBarSize）：竖柱按可用宽度分组自适应，钉死 barSize
 * 会在窄屏把 X 轴标签挤没。宽裕时就是 10px，窄了才收。
 */
const BAR_SIZE = 10;
const BAR_RADIUS = 3;
const MAX_TICK_CHARS = 7;

/** X 轴放不下整个模块名，超长截断；完整名字在卡片下面的表格里。 */
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

/** 计数轴只画整数刻度——2.5 条用例这种小数刻度没有意义。 */
const Y_AXIS_PROPS = {
	allowDecimals: false,
	axisLine: false,
	tickLine: false,
	tickMargin: 4,
	type: "number",
} as const;

export interface ReportModuleBarsProps {
	/** 图区高度（px），由壳那边用 reportModuleHeightPx 算好传进来——占位与真身
	 * 必须读同一个数，理由见 chart-box.ts。 */
	heightPx: number;
	rows: readonly ReportModuleStat[];
}

/**
 * 通过 / 失败两根并排的竖柱。整块 aria-hidden：完整读数通道始终是卡片下面的
 * 表格，图只是它的可视化；hover tooltip 是给用鼠标的人加的即时读数，
 * 不是无障碍通道，所以 aria-hidden 立场不变。
 *
 * **不堆叠**：堆叠柱的总高是「通过+失败」，两个模块的柱子一样高可能是
 * 10 通过 0 失败，也可能是 0 通过 10 失败。这张图要一眼看出哪个模块失败多，
 * 那就得让「失败」自己有一根从同一条基线出发的柱子。
 */
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

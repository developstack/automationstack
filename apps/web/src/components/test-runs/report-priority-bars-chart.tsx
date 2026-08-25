/**
 * 报告页「按优先级的通过率」柱图的真身。**只能经由 report-priority-card.tsx 的动态
 * import 进来**，理由（recharts 会被提回入口 chunk）见 overview-donut.tsx 的头注释。
 */
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

/**
 * 与 overview-priority-bars-chart.tsx 同一套「石板蓝」单色明度阶（--priority-0..3）：
 * 序数编码，P0 最深 → P3 最浅，暗色镜像反转、P0 最亮。蓝是「维度色」，与本页
 * 彩色的结论色（--result-*）并排时分工清晰：彩=结论、蓝=分档——柱图画的是通过率，
 * 蓝柱不会被读成成败，也不会拿红色预判某一档「挂了」。
 * 那边刻意没导出这张表，这里照抄一份而不是把它挪成公共常量：跨页共享一个
 * 「顺手能用」的取色表，会让两页的图在其中一页改需求时被迫一起动。
 * 它是冗余编码——真正区分四根柱子的是 Y 轴上写着的 P0..P3。
 */
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
/** 通过率是 0–1 的比值，轴域钉死，柱长直接就是通过率本身。 */
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
	/** 图区高度（px），由壳那边用 reportPriorityHeightPx 算好传进来——占位与真身
	 * 必须读同一个数，理由见 chart-box.ts。 */
	heightPx: number;
	/** 只含 `passRate !== null` 的档，理由见 ReportPriorityCard。 */
	rows: readonly { passRate: number; priority: CasePriority }[];
}

/**
 * 按优先级的通过率横向柱状。整块 aria-hidden，读数由卡片里的表格给出
 * （同 overview-priority-bars-chart.tsx 的头注释）。
 */
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

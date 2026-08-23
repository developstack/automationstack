import type { CasePriority } from "@automationstack/db/schema/test-cases";
import {
	type ChartConfig,
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from "@automationstack/ui/components/chart";
import { Bar, BarChart, Cell, XAxis, YAxis } from "recharts";

import { PRIORITY_VALUES } from "@/components/cases/case-meta";
import {
	CHART_ANIMATION,
	CHART_SEAM,
	useChartAnimation,
} from "@/components/overview/overview-chart";

/**
 * 优先级是有序量，配色因此走单调色阶而不是四个「并列」的颜色：P0 最深、P3 最浅，
 * 深浅方向与优先级高低同向。它是冗余编码——真正区分四根柱子的是 Y 轴上写着的
 * P0..P3，色阶只是让「哪一档更重」不用读字也能看出来。
 * 刻意不复用 case-meta 的 PRIORITY_BADGE_VARIANTS（实心危险色→无填充那一套）：
 * 那是徽章的填充强度，不是给图形元素测过 3:1 的色阶。
 */
const PRIORITY_COLORS: Record<CasePriority, string> = {
	P0: "var(--chart-5)",
	P1: "var(--chart-4)",
	P2: "var(--chart-3)",
	P3: "var(--chart-2)",
};

const CHART_CONFIG: ChartConfig = { count: { label: "用例数" } };
const BAR_MARGIN = { bottom: 0, left: 0, right: 0, top: 0 };
/** 柱高；四档在 h-32（128px）里各占 32px 带宽，柱居中，上下各留 8px。 */
const BAR_SIZE = 16;
const BAR_RADIUS = 4;
/** Y 轴留给 "P0" 这类刻度文字的宽度（含 tickMargin 4px）。 */
const AXIS_WIDTH = 28;
const TICK_MARGIN = 4;

/**
 * 类目轴（Y 轴）的固定配置。提到模块作用域是为了让下面的图表只剩「画什么」：
 * 这几项从来不随 props 变，写在 JSX 里只会把柱子的配置挤到看不见的地方。
 * 不画轴线与刻度线，轴上只留 P0..P3 这四个文字——它们才是区分柱子的信息本体。
 */
const Y_AXIS_PROPS = {
	axisLine: false,
	dataKey: "priority",
	tickLine: false,
	tickMargin: TICK_MARGIN,
	type: "category",
	width: AXIS_WIDTH,
} as const;

/** 按 P0..P3 的固定次序摊平成 recharts 要的行，缺档不会静默消失。 */
function buildRows(counts: Record<CasePriority, number>) {
	return PRIORITY_VALUES.map((priority) => ({
		count: counts[priority],
		priority,
	}));
}

interface OverviewPriorityBarsProps {
	counts: Record<CasePriority, number>;
	total: number;
}

/**
 * 优先级分布条形图（横向）。
 *
 * 横向而不是纵向：四个类目名是固定的两字符标签，放在 Y 轴上永远不需要旋转或截断，
 * 而概览页最窄时是单列全宽、最宽时是三列中的一列——横向柱子的长度方向跟着列宽伸缩，
 * 类目方向不变，窄列里也不会挤成一片。
 *
 * 整块 aria-hidden，理由同 overview-donut.tsx：读数由卡片正文里的徽章图例给出；
 * BarChart 上的 role="presentation" tabIndex={-1} 同样是配套，见那边的注释。
 */
export function OverviewPriorityBars({
	counts,
	total,
}: OverviewPriorityBarsProps) {
	const animate = useChartAnimation();
	const rows = buildRows(counts);

	return (
		<ChartContainer
			aria-hidden="true"
			className="aspect-auto h-32 w-full"
			config={CHART_CONFIG}
		>
			<BarChart
				data={rows}
				layout="vertical"
				margin={BAR_MARGIN}
				role="presentation"
				tabIndex={-1}
			>
				{/*
				 * 轴域钉在 [0, 总数] 而不是让 recharts 按最大值自适应：这样柱长直接就是
				 * 占比，和背景槽一起读出「这一档占全部用例的多少」，而不只是四根柱子
				 * 互相比长短。槽走 --chart-1——它压卡片 1.48:1，本来就只配当垫底。
				 */}
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

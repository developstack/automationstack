/**
 * 环形图的真身。**这个文件只能经由 overview-donut.tsx 的动态 import 进来。**
 *
 * 它静态引用 recharts（还有 ui/components/chart，那一个内部也引 recharts），
 * 是全站体积最大的第三方依赖之一。任何首屏可达的模块只要静态 import 到这里，
 * recharts 就会被 Rollup 提回入口 chunk——拆分见 overview-donut.tsx 的头注释。
 */
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

/**
 * 环的几何。容器尺寸（160×160）由 DONUT_BOX 给出，与懒加载占位共用同一份，
 * 理由见 chart-box.ts。外半径 76 而不是 80，留 4px 给 2px 分缝的外溢与抗锯齿。
 */
const OUTER_RADIUS = 76;
const INNER_RADIUS = 52;
/** 中心两行文字相对圆心的偏移：读数上移半行，标注落在它下面。 */
const VALUE_DY = -8;
const LABEL_DY = 16;
/** 默认 margin 是四边各 5px，会把 160 的画布缩到 150，外半径 76 就顶出去了。 */
const PIE_MARGIN = { bottom: 0, left: 0, right: 0, top: 0 };
/**
 * 轨道段的 key。它不进 ChartConfig、不出现在 tooltip、也不出现在图例——
 * 轨道走 --chart-1，实测压卡片只有 1.48:1，达不到 WCAG 1.4.11 的 3:1，
 * 只能当「整圆有多大」的暗示，不能承载任何一个数据系列。
 */
const TRACK_KEY = "__track";

export interface DonutSlice {
	/**
	 * 直接给 CSS 颜色（如 "var(--chart-5)"）而不是走 ChartConfig 的 color 字段：
	 * 后者会让 ChartStyle 额外注入一段 <style>，而我们要的只是逐扇区上色。
	 * 用 var(--chart-*) 而不是在 JS 里算颜色，亮暗主题切换由 CSS 变量自己完成。
	 */
	color: string;
	key: string;
	label: string;
	value: number;
}

interface DonutCenterProps {
	label: string;
	value: string;
	/** 由 recharts 的 <Label> 通过 cloneElement 注入。 */
	viewBox?: { cx?: number | string; cy?: number | string };
}

/**
 * 环心的两行字。
 *
 * 写成一个顶层组件、用 `content={<DonutCenter … />}` 传进去，而不是传一个就地写的
 * 渲染函数：后者在 JSX 里返回元素，会被当成「组件定义在组件内部」。
 */
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
	/** 单值占比（进度环）没有第二个系列可比，hover 只会把中心已经写着的数再说一遍。 */
	showTooltip?: boolean;
	slices: readonly DonutSlice[];
	/** 进度环的「剩余」段，用 --chart-1 垫底。0 表示没有轨道，整圈都是数据。 */
	trackValue?: number;
}

/**
 * 扇区的 label 表。只放 label 不放 color，逐扇区上色走 data 里的 fill，
 * 理由见 DonutSlice.color 上的注释。
 */
function buildChartConfig(slices: readonly DonutSlice[]): ChartConfig {
	return Object.fromEntries(
		slices.map((slice) => [slice.key, { label: slice.label }])
	);
}

/**
 * 喂给 <Pie> 的扇区数组：数据段在前，轨道段（若有）垫在最后一段。
 */
function buildPieData(slices: readonly DonutSlice[], trackValue: number) {
	/*
	 * 过滤掉 0：零角度扇区本身不占面积，但 2px 的分缝仍会照描，在环上留下一根
	 * 无处可点的短刺。
	 */
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

/**
 * 概览页的环形图，构成类问题共用这一个（用例状态、模块覆盖、AI 采纳率）。
 *
 * 整块 aria-hidden：环里的一切都是 SVG，读屏拿到的是空的；每张卡各自在正文里给出
 * 同一份数据的文字等价物（计数行 / sr-only 一句话），播两遍只会更吵——这与本目录
 * 原来那条手搓分布条的处理一致。
 *
 * PieChart 上的 role="presentation" tabIndex={-1} 是这条 aria-hidden 的配套：recharts
 * 默认给根 <svg> 挂 role="application" tabIndex={0}，一个能被 Tab 聚焦、却又被
 * aria-hidden 藏起来的元素，读屏用户会「焦点跑进了一个不存在的地方」。
 */
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

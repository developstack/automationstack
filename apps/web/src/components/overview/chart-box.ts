/**
 * 图表容器的几何：懒加载占位与真身共用的那一份尺寸。
 *
 * 四张图现在都走 lazy + Suspense（壳在 overview-donut.tsx、overview-priority-bars.tsx
 * 与两张报告卡里），chunk 到达之前得先摆一个占位。占位必须与真身**等高**：图区塌成
 * 0 高再弹回来，比多等那一会儿难受得多；而且概览页与报告页的栅格都是 auto-rows-min，
 * 一张卡抽高会把同一行别的卡一起顶动，跳的不只是这一格。
 *
 * 尺寸单独抽这一份、而不是让占位那边照抄一遍类名字符串：抄出来的那份不会跟着真身改，
 * 「等高」就退化成一句没人守的注释。放在这里，两边引的是同一个常量，改一处两边同时动。
 *
 * ⚠️ 这个模块**不许**引入 recharts 或 ui/components/chart。它是被首屏那一侧的壳直接
 * 静态引用的，一旦从这里把 recharts 带进去，整轮懒加载就白做了——recharts 会重新
 * 回到入口 chunk 里，正是这次要拆掉的那条边。
 */

/**
 * 环形图的盒子：h-40 w-40 = 160×160，钉死不随列宽伸缩。
 * 概览页是 1/2/3 列的响应式栅格，环若按百分比取半径，同一张卡在不同断点下高度就不一样，
 * 占位与骨架屏也就没有一个可以对齐的数值（overview-skeleton.tsx 的 size-40 同出一源）。
 */
export const DONUT_BOX = "mx-auto aspect-square h-40 w-40";

/**
 * 概览页优先级条形图的盒子：h-32 = 128px，四档在其中各占 32px 带宽。
 * aspect-auto 是为了压掉 ChartContainer 自带的 aspect-video。
 */
export const OVERVIEW_BARS_BOX = "aspect-auto h-32 w-full";

/**
 * 报告页两张图的盒子。它们的高度随行数/模块数变，写在 style 上（见下面两个函数），
 * 类名里只留宽度与 aspect 复位。
 */
export const REPORT_BARS_BOX = "aspect-auto w-full";

/** 报告页优先级图：每档一行 32px，与概览页那张图的 32px 带宽同值。 */
const REPORT_PRIORITY_ROW_PX = 32;

/** 只画 passRate 非空的档，所以行数由调用方算好传进来。 */
export function reportPriorityHeightPx(rowCount: number): number {
	return rowCount * REPORT_PRIORITY_ROW_PX;
}

/** 每个模块分到的竖柱绘图高度，X 轴标签带另算。 */
const MODULE_PLOT_HEIGHT_PX = 40;
const X_AXIS_LABEL_BAND_PX = 24;
const MIN_CHART_HEIGHT_PX = 160;
const MAX_CHART_HEIGHT_PX = 320;

/**
 * 报告页模块图：竖柱高度随模块数伸缩，夹在 [160, 320]——模块少时不塌成一条线，
 * 模块多时也不把卡片无限拉长。
 */
export function reportModuleHeightPx(moduleCount: number): number {
	const fitted = moduleCount * MODULE_PLOT_HEIGHT_PX + X_AXIS_LABEL_BAND_PX;
	return Math.min(MAX_CHART_HEIGHT_PX, Math.max(MIN_CHART_HEIGHT_PX, fitted));
}

// 项目概览的布局类名（调研报告第 9.2 节）。卡片和骨架屏都从这里取，保证骨架屏与最终布局一致。
// 窄屏时所有卡片排成一列，顺序不变。

export const OVERVIEW_MAIN =
	"grid min-h-0 auto-rows-min grid-cols-1 gap-4 overflow-y-auto p-4 lg:grid-cols-3";

/** 占一列的卡片：第一屏第 1 行的 M1、M2、M4，以及 M5、M9。同一行的卡片同高。 */
export const NARROW_CARD = "min-w-0";

/** 占两列的卡片：M4 的模块条形图和 P0/P1 列表、M8 模块覆盖缺口。 */
export const WIDE_CARD = "min-w-0 lg:col-span-2";

/** 占整行的卡片：M3 进行中的测试任务。 */
export const FULL_CARD = "col-span-full min-w-0";

/** M6 和 M7 两个趋势图并排，使用同一组 7 天区间。 */
export const TREND_PAIR =
	"col-span-full grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-2";

/** 圆环图和环形进度图的卡片内容：图在上，图例在下。 */
export const RING_CARD_CONTENT = "flex flex-col items-center gap-4";

/** 大数字和趋势图的卡片内容。 */
export const TREND_CARD_CONTENT = "flex flex-col gap-4";

export const TREND_CHART_BOX = "aspect-auto h-32 w-full";

export const STACKED_CHART_BOX = "aspect-auto h-56 w-full";

/** 进行中的测试任务的一行。窄屏下换成多行。 */
export const RUN_ROW_GRID =
	"grid grid-cols-1 items-center gap-x-4 gap-y-1.5 py-3 md:grid-cols-overview-run";

/** 优先级的行：标签、条形码式进度条、条数和占比。 */
export const PRIORITY_GRID =
	"grid grid-cols-overview-priority items-center gap-x-3 gap-y-3";

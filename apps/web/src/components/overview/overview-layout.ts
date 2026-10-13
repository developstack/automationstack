// 项目概览的布局类名。卡片和骨架屏都从这里取，保证骨架屏与最终布局一致。

export const OVERVIEW_MAIN =
	"grid min-h-0 auto-rows-min grid-cols-1 gap-4 overflow-y-auto p-4 lg:grid-cols-3";

/** 优先级分布和高优先级陈旧用例在宽屏下叠放在覆盖矩阵的右侧。 */
export const OVERVIEW_SIDE_COLUMN = "flex min-w-0 flex-col gap-4";

export const STATUS_CARD_CLASS = "col-span-full";

export const STATUS_CARD_CONTENT = "flex flex-col gap-6 md:flex-row";

/** 用例状态卡片左侧的用例总数。 */
export const STATUS_TOTAL_COLUMN =
	"flex shrink-0 flex-col gap-2 md:w-44 md:border-r md:pr-6";

export const STATUS_DETAIL_COLUMN = "flex min-w-0 flex-1 flex-col gap-4";

export const STATUS_COUNT_GRID = "grid grid-cols-3 gap-4";

export const BARCODE_BOX = "flex h-10 gap-px sm:gap-0.5";

export const COVERAGE_CARD_CLASS = "min-w-0 lg:col-span-2";

export const CHANGES_CARD_CLASS = "col-span-full";

/** 优先级的行：标签、横条、条数和占比。 */
export const PRIORITY_GRID =
	"grid grid-cols-overview-priority items-center gap-x-3 gap-y-3";

/** 最近改动的一行：用例名、版本、备注、保存人、时间。窄屏下换成多行。 */
export const CHANGE_ROW_GRID =
	"grid grid-cols-overview-change items-center gap-x-3 gap-y-0.5 py-2 text-sm md:grid-cols-overview-change-wide";

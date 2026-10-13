/** 用例表格和它的骨架屏共用的列、表头样式和行高，让骨架屏与最终布局一致。 */
export const CASE_TABLE_COLUMNS = [
	{ label: "名称", width: "pl-4" },
	{ label: "优先级", width: "w-16" },
	{ label: "类型", width: "w-16" },
	{ label: "状态", width: "w-20" },
	{ label: "标签", width: "" },
	{ label: "维护人", width: "" },
	{ label: "更新时间", width: "w-32" },
	{ label: "协作", width: "w-24 pr-4" },
] as const;

/** 表头是小标签：中文小字、灰色、加大字间距。 */
export const CASE_TABLE_HEAD_CLASS =
	"eyebrow h-10 font-medium text-muted-foreground";

export const CASE_TABLE_ROW_HEIGHT = "h-11";

/** 表格、空状态、出错和底部分页所在的卡片面板。骨架屏使用同一个面板。 */
export const CASE_LIST_PANEL_CLASS =
	"flex min-w-0 flex-col overflow-hidden rounded-xl border bg-card text-card-foreground shadow-card";

/** 面板底部的条数和分页。骨架屏使用同一个布局。 */
export const CASE_LIST_FOOTER_CLASS =
	"flex min-h-12 flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t px-4 py-2";

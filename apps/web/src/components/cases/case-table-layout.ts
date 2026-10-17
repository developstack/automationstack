import type { TableSkeletonColumn } from "@/components/skeletons/table-skeleton";

interface CaseTableColumn {
	/** 骨架屏中表头和单元格的灰条宽度 */
	bars: { head: string; value: string };
	/** 没有固定宽度、占剩余空间的列 */
	grow: boolean;
	label: string;
	width: string;
}

/** 用例表格和它的骨架屏共用的列，让骨架屏与最终布局一致。 */
export const CASE_TABLE_COLUMNS: readonly CaseTableColumn[] = [
	{
		bars: { head: "w-7", value: "w-4/5" },
		grow: true,
		label: "名称",
		width: "pl-4",
	},
	{
		bars: { head: "w-10", value: "w-2/3" },
		grow: false,
		label: "优先级",
		width: "w-16",
	},
	{
		bars: { head: "w-7", value: "w-2/3" },
		grow: false,
		label: "类型",
		width: "w-16",
	},
	{
		bars: { head: "w-7", value: "w-3/4" },
		grow: false,
		label: "状态",
		width: "w-20",
	},
	{
		bars: { head: "w-7", value: "w-2/3" },
		grow: true,
		label: "标签",
		width: "",
	},
	{
		bars: { head: "w-10", value: "w-1/2" },
		grow: true,
		label: "维护人",
		width: "",
	},
	{
		bars: { head: "w-14", value: "w-full" },
		grow: false,
		label: "更新时间",
		width: "w-32",
	},
	{
		bars: { head: "w-7", value: "w-2/3" },
		grow: false,
		label: "协作",
		width: "w-24 pr-4",
	},
];

export const CASE_SKELETON_COLUMNS: readonly TableSkeletonColumn[] =
	CASE_TABLE_COLUMNS.map((column) => ({
		head: column.bars.head,
		label: column.label,
		value: column.bars.value,
		width: `${column.width} ${column.grow ? "flex-1" : "shrink-0"}`,
	}));

/** 表头是小标签：中文小字、灰色、加大字间距。 */
export const CASE_TABLE_HEAD_CLASS =
	"eyebrow h-10 font-medium text-muted-foreground";

export const CASE_TABLE_ROW_HEIGHT = "h-11";

/** 表格、空状态、出错和底部分页所在的卡片面板。骨架屏使用同一个面板。 */
export const CASE_LIST_PANEL_CLASS =
	"flex min-w-0 flex-col overflow-hidden rounded-lg border bg-card text-card-foreground shadow-card";

/** 面板底部的条数和分页。骨架屏使用同一个布局。 */
export const CASE_LIST_FOOTER_CLASS =
	"flex min-h-12 flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t px-4 py-2";

/**
 * 用例列表的加载骨架（原 case-table-states.tsx 的前半段）。
 * 空态在 case-table-empty.tsx。
 */
import { CASE_PAGE_SIZE } from "@/components/cases/case-list-query";
import {
	TableSkeleton,
	type TableSkeletonColumn,
} from "@/components/skeletons/table-skeleton";

/**
 * 用例表每一列的骨架形状。逐条对着 case-table.tsx 的 COLUMNS 与 CaseRow 填：
 * width 与真 `<TableHead className>` 逐字同源（钉宽的列补 shrink-0，留空吃剩余
 * 宽度的列改写成 flex-1，两者在 flex 行里的效果与 auto 表格布局一致）；
 * head 按列名字数折算（text-sm 一个全角字约 14px）；value 是该列真实内容在
 * 单元格里横向占多少——徽章、枚举词、定长日期各有各的占比。
 *
 * 为什么要这一层：合并前这份骨架是一根根 `w-full` 的实心条，20 行叠成一堵约
 * 760px 的灰墙，比它要替代的那张表还重。真表一行文字只铺该行三四成的墨，
 * 剩下的是列与列之间的空。按列摊开之后骨架才有「表」的样子。
 */
const CASE_SKELETON_COLUMNS: readonly TableSkeletonColumn[] = [
	{ head: "w-7", label: "名称", value: "w-4/5", width: "flex-1" },
	{ head: "w-10", label: "优先级", value: "w-2/3", width: "w-16 shrink-0" },
	{ head: "w-7", label: "类型", value: "w-2/3", width: "w-16 shrink-0" },
	{ head: "w-7", label: "状态", value: "w-3/4", width: "w-20 shrink-0" },
	{ head: "w-7", label: "标签", value: "w-2/3", width: "flex-1" },
	{ head: "w-10", label: "维护人", value: "w-1/2", width: "flex-1" },
	{ head: "w-14", label: "更新时间", value: "w-full", width: "w-28 shrink-0" },
	{ head: "w-7", label: "协作", value: "w-2/3", width: "w-24 shrink-0" },
];

interface CaseTableSkeletonProps {
	/**
	 * 骨架行数。默认取 CASE_PAGE_SIZE——调用方都是在等一页用例，
	 * 一页就是这么多行。
	 */
	rows?: number;
}

/**
 * 列表首屏骨架：高度按真实表格逐行折算，避免加载完成时的跳动。
 * 表头 = TableHead 的 h-10（40px）+ TableHeader 的 border-b 1px（mb-px）= 41px；
 * 数据行 = TableCell 的 p-2（16px）+ Badge 的 h-5（20px）= 36px（h-9）
 * + TableRow 的 border-b 1px（mt-px）= 37px。
 * 末行同样带边框、不做例外，所以骨架行一律加 mt-px。
 *
 * 行数必须跟着**页大小**走，不能钉死一个小常数。原先固定 6 行，而
 * case-list-query.ts 的 CASE_PAGE_SIZE 是 20：满页真身 41 + 20×37 = 781px，
 * 骨架只有 41 + 6×37 = 263px，数据到达那一帧下方的分页条要往下掉 518px。
 *
 * 折算按满页算，不按「平均有多少条」算：不满一页时骨架比真身高，多出来的空白
 * 是往下收，分页条**上移**；而按小数取值时只要来了满页就会整块下坠。两者都动，
 * 但前者的最大位移被一页封顶且只在末页出现，后者是常态。
 *
 * 折算的真身在 case-table.tsx 的 CaseRow / COLUMNS，那边改行高要回来对齐这里。
 * 高度全部落在 TableSkeleton 的 bordered 档里，这里只描列的形状。
 */
export function CaseTableSkeleton({
	rows = CASE_PAGE_SIZE,
}: CaseTableSkeletonProps) {
	return (
		<TableSkeleton
			columns={CASE_SKELETON_COLUMNS}
			label="用例列表加载中"
			rows={rows}
		/>
	);
}

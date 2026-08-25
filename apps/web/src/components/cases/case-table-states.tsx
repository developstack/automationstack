import { Button } from "@automationstack/ui/components/button";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@automationstack/ui/components/empty";
import { Skeleton } from "@automationstack/ui/components/skeleton";
import { cn } from "@automationstack/ui/lib/utils";
import { ClipboardListIcon, FilterXIcon } from "lucide-react";

import { CASE_PAGE_SIZE } from "@/components/cases/case-list-query";

/*
 * 骨架行的 key。在模块作用域一次性生成，而不是在 JSX 里拿 map 的下标当 key：
 * 行数是变量，写成 key={index} 既过不了 lint，语义上也不对。
 */
function skeletonRowKeys(rows: number): string[] {
	return Array.from({ length: rows }, (_, index) => `skeleton-row-${index}`);
}

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
 * （原先这里的核对写的是「真实 41 + 6×37 = 骨架 41 + 6×37」——那是拿 6 行骨架
 * 比 6 行真身，前提根本不成立，等于把不等式写成了恒等式。）
 *
 * 折算按满页算，不按「平均有多少条」算：不满一页时骨架比真身高，多出来的空白
 * 是往下收，分页条**上移**；而按小数取值时只要来了满页就会整块下坠。两者都动，
 * 但前者的最大位移被一页封顶且只在末页出现，后者是常态。
 *
 * 覆盖成 rounded-none：Skeleton 默认 rounded-md，但表格行本身是方角的，
 * 骨架带圆角既不像它要替代的东西，贴合堆叠时行与行之间还会露出一串缺口。
 * 折算的真身在 case-table.tsx 的 CaseRow / COLUMNS，那边改行高要回来对齐这里。
 */
export function CaseTableSkeleton({
	rows = CASE_PAGE_SIZE,
}: CaseTableSkeletonProps) {
	return (
		<output
			aria-busy="true"
			aria-label="用例列表加载中"
			className="flex flex-col"
		>
			<Skeleton className="mb-px h-10 w-full rounded-none" />
			{skeletonRowKeys(rows).map((key) => (
				<Skeleton className="mt-px h-9 w-full rounded-none" key={key} />
			))}
		</output>
	);
}

interface CaseEmptyProps {
	/** 由 CaseTable 传入的状态类（「这份是旧结果」的淡化）。 */
	className?: string;
	filtered: boolean;
	onClearFilters: () => void;
}

/** 图标交叉淡入的公共类：两枚图标叠在一起，只切 opacity。
    transition-crossfade 同时负责在「减弱动效」下保住这段淡入——那正是本结构
    要消除的那一下硬切，见 globals.css 里该工具类上方的注释。 */
const SWAP_ICON = "absolute inset-0 size-5 transition-crossfade";

/**
 * 空态图标随「是否处于筛选」切换。仓库不引入动画库，按纯 CSS 方案做交叉淡入：
 * 两枚图标都留在 DOM 里、绝对定位叠放，避免切换时图标「啪」地跳一下。
 */
function CaseEmptyIcon({ filtered }: { filtered: boolean }) {
	return (
		<span className="relative block size-5">
			<FilterXIcon
				aria-hidden={true}
				className={cn(SWAP_ICON, filtered ? "opacity-100" : "opacity-0")}
			/>
			<ClipboardListIcon
				aria-hidden={true}
				className={cn(SWAP_ICON, filtered ? "opacity-0" : "opacity-100")}
			/>
		</span>
	);
}

/**
 * 空态的进场。这里用 keyframes（tw-animate-css 的 animate-in）而不是像
 * CaseEmptyIcon 那样用 transition，是因为两者要解决的问题不同：图标那一对
 * 始终留在 DOM 里、只切 opacity，可打断的补间才接得上来回快切；这一块是
 * 真正的挂载，元素上一帧还不存在，没有「当前值」可供插值，只有 keyframes
 * 能给出首帧。这块也不会被反复快切——一旦为空就停在这里，直到下一次查询回来。
 *
 * fade + 4px 上浮，不做缩放：这是一块占满剩余高度的大面积虚线框，缩放会让
 * 它的边框整体涨缩一下，比硬切还吵；4px 的位移只够读出「它是刚出现的」。
 * 200ms 对齐仓库里对话框那一档（dialog.tsx / alert-dialog.tsx），比高频
 * 浮层的 150ms 慢一档——这一块面积大、出现得少，值得多给一拍。
 *
 * 「减弱动效」下由 globals.css 末尾那条规则压到近似瞬时，退回硬切，符合预期。
 */
const EMPTY_ENTER_CLASS =
	"animate-in fade-in-0 slide-in-from-bottom-1 duration-200";

/**
 * 两种空态要分开：没筛选时是「这个模块还没有用例」，
 * 筛选后为空则必须给一个「清除筛选」的出口，否则用户会以为数据没了。
 */
export function CaseTableEmpty({
	className,
	filtered,
	onClearFilters,
}: CaseEmptyProps) {
	return (
		<Empty className={cn(EMPTY_ENTER_CLASS, className)}>
			<EmptyHeader>
				<EmptyMedia variant="icon">
					<CaseEmptyIcon filtered={filtered} />
				</EmptyMedia>
				<EmptyTitle>{filtered ? "没有匹配的用例" : "还没有用例"}</EmptyTitle>
				<EmptyDescription>
					{filtered
						? "当前筛选条件没有命中任何用例，换个条件或清除筛选试试。"
						: "这个范围下还没有用例，点击右上角「新建用例」开始。"}
				</EmptyDescription>
			</EmptyHeader>
			{filtered ? (
				<EmptyContent>
					<Button onClick={onClearFilters} size="sm" variant="outline">
						清除筛选
					</Button>
				</EmptyContent>
			) : null}
		</Empty>
	);
}

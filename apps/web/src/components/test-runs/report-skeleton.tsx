import {
	Card,
	CardContent,
	CardHeader,
} from "@automationstack/ui/components/card";
import { Skeleton } from "@automationstack/ui/components/skeleton";
import type { ReactNode } from "react";

/**
 * 报告页首屏骨架。
 *
 * 换算表沿用 overview-skeleton.tsx 那一份（真实类名 → 骨架高度）：
 *   CardTitle        text-base leading-normal = 24px → h-6
 *   CardDescription  text-sm  leading-normal = 21px → h-5
 *   大号读数          text-3xl                = 36px → h-9
 *   表格行            TableCell 的 p-2 + text-sm ≈ 37px → h-9
 *   环形图            OverviewDonut 的 h-40 w-40 → mx-auto size-40 rounded-full
 *
 * **刻意不画顶部那条提交条**：它只在「已完成」时才存在，而报告页最常被打开的时刻是
 * 测试中（那时压根没有这条）。给一个多半不会出现的元素占位，等于保证大多数情况下
 * 数据到达那一帧整页往上跳一条的高度。
 *
 * 外框直接复用真的 <Card>：卡片的内边距与间距写在 --card-spacing 上，
 * 抄一份数值出来那边一改这边就错位。
 *
 * 表格类卡片的行数由数据决定（失败 0..N 条都可能），骨架不可能恒等；
 * 按「行高对齐、条数取中间值」处理——栅格是 auto-rows-min，
 * 伸缩只发生在这张卡自己身上，不会把同行别的卡一起顶动。
 */

const SUMMARY_STAT_KEYS = ["total", "passed", "failed", "blocked"] as const;
const RATE_KEYS = ["completion", "pass"] as const;
const PRIORITY_ROW_KEYS = ["p0", "p1", "p2", "p3"] as const;
const LEGEND_ROW_KEYS = ["l1", "l2", "l3", "l4", "l5"] as const;
const MODULE_ROW_KEYS = ["m1", "m2", "m3", "m4"] as const;
const FAILED_ROW_KEYS = ["f1", "f2", "f3", "f4"] as const;

interface CardSkeletonProps {
	children: ReactNode;
	/** 描述灰条的宽度类，按各卡描述的实际字数取。 */
	descriptionWidth: string;
	titleWidth: string;
}

/*
 * 不收 className：跨列类名统一写在 ReportSkeleton 里的包装层上。包了一层之后
 * grid item 就是那层 div，`xl:col-span-*` 留在 <Card> 上会落在非 grid item 身上，
 * 跨列当场失效。
 */
function CardSkeleton({
	children,
	descriptionWidth,
	titleWidth,
}: CardSkeletonProps) {
	return (
		<Card>
			<CardHeader>
				<Skeleton className={`h-6 ${titleWidth}`} />
				<Skeleton className={`h-5 ${descriptionWidth}`} />
			</CardHeader>
			<CardContent>{children}</CardContent>
		</Card>
	);
}

/** 一行大读数：标签(h-5) + 数字(h-9) + 口径注脚(h-4)，与 ReportStat 逐行对齐。 */
function StatSkeleton() {
	return (
		<div className="flex flex-col gap-0.5">
			<Skeleton className="h-5 w-16" />
			<Skeleton className="h-9 w-20" />
			<Skeleton className="h-4 w-full" />
		</div>
	);
}

function TableRowsSkeleton({ keys }: { keys: readonly string[] }) {
	return (
		<div className="flex flex-col">
			{keys.map((key) => (
				<Skeleton className="my-1 h-9 w-full" key={key} />
			))}
		</div>
	);
}

/*
 * 下面每张卡各自一个组件，纯粹是为了给 ReportSkeleton 腾出 eslint
 * `max-lines-per-function`（上限 50 行）的额度：骨架每对齐一张真卡就多几行 JSX，
 * 而这几段彼此之间没有任何条件或数据往来，搬走它们不改变渲染结果。
 * 同文件内拆子组件是本目录既有的写法（见 report-view.tsx 里的 ReportHeader，
 * 那处拆分的理由与这里逐字相同）。
 *
 * ⚠️ 搬动时高度与宽度类名**一个字符都不许改**：文件头那张换算表是逐个控件
 * 核算出来的，与就绪态严丝合缝。改一个 h-* 就等于让数据到达那一帧整页跳一下，
 * 而这正是这个文件存在的唯一理由。下面每个组件对齐 report-view.tsx 里同名的
 * 那张卡，**顺序也必须与那边一致**——栅格按源码顺序排位，错位了对不上的
 * 不只是高度，还有左右两列。
 */

/** 对齐 ReportHeader：面包屑(h-5) + 标题(h-6)。它自己就是 grid item，跨列类名写在这里。 */
function HeadingSkeleton() {
	return (
		<div className="flex items-center gap-3 xl:col-span-3">
			<Skeleton className="h-5 w-24" />
			<Skeleton className="h-6 w-48" />
		</div>
	);
}

/** 对齐 ReportSummaryCard：四个计数读数 + 分隔线 + 两个比率读数。 */
function SummaryCardSkeleton() {
	return (
		<CardSkeleton descriptionWidth="w-96" titleWidth="w-24">
			<div className="grid grid-cols-2 gap-4 md:grid-cols-4">
				{SUMMARY_STAT_KEYS.map((key) => (
					<StatSkeleton key={key} />
				))}
			</div>
			<Skeleton className="h-px w-full" />
			<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
				{RATE_KEYS.map((key) => (
					<StatSkeleton key={key} />
				))}
			</div>
		</CardSkeleton>
	);
}

/** 对齐 ReportPriorityCard：P0 结论条 + 优先级表（与它同为两列宽，见下面的包装层）。 */
function PriorityCardSkeleton() {
	return (
		<CardSkeleton descriptionWidth="w-80" titleWidth="w-36">
			{/* P0 结论条：px-3 py-2 + text-sm 一行 ≈ 37px */}
			<Skeleton className="h-9 w-full" />
			<TableRowsSkeleton keys={PRIORITY_ROW_KEYS} />
		</CardSkeleton>
	);
}

/** 对齐 ReportResultCard：环形图 + 图例。这是同一行里唯一的单列卡。 */
function ResultCardSkeleton() {
	return (
		<CardSkeleton descriptionWidth="w-56" titleWidth="w-20">
			<Skeleton className="mx-auto size-40 rounded-full" />
			<div className="flex flex-col gap-1.5">
				{LEGEND_ROW_KEYS.map((key) => (
					<Skeleton className="h-5 w-full" key={key} />
				))}
			</div>
		</CardSkeleton>
	);
}

/** 对齐 ReportModuleCard：模块表，条数取中间值（理由见文件头）。 */
function ModuleCardSkeleton() {
	return (
		<CardSkeleton descriptionWidth="w-72" titleWidth="w-40">
			<TableRowsSkeleton keys={MODULE_ROW_KEYS} />
		</CardSkeleton>
	);
}

/** 对齐 ReportFailedCasesCard：失败清单表，条数同样取中间值。 */
function FailedCasesCardSkeleton() {
	return (
		<CardSkeleton descriptionWidth="w-96" titleWidth="w-28">
			<TableRowsSkeleton keys={FAILED_ROW_KEYS} />
		</CardSkeleton>
	);
}

/**
 * 这些卡片没有逐项错开的出场次序，**这是刻意的**。
 *
 * 原来每张外面各裹一层 StaggerItem 按 index 依次淡入（序号还刻意与 report-view.tsx
 * 逐个对齐、跳过提交条那一号），整场因此拖到 440ms，已整体删除，理由见
 * page-transition.tsx 末尾那节。现在骨架与真身都只跟着 <main> 整体淡入一次，
 * 两条路（loader 快慢）的观感本来就一致，不再需要那套对齐。
 *
 * 剩下的包装 div 只有栅格占位一个职责：里面几张卡不收 className，跨列类名只能落在
 * 包装层上；`grid` 是为了让 <Card> 跟着包装层一起满高，同一行的卡底边才齐平。
 * 顺序仍必须与 report-view.tsx 逐个一致——栅格按源码顺序排位。
 */
export function ReportSkeleton() {
	return (
		<>
			<HeadingSkeleton />
			<div className="grid xl:col-span-3">
				<SummaryCardSkeleton />
			</div>
			<div className="grid xl:col-span-2">
				<PriorityCardSkeleton />
			</div>
			<ResultCardSkeleton />
			<div className="grid xl:col-span-3">
				<ModuleCardSkeleton />
			</div>
			<div className="grid xl:col-span-3">
				<FailedCasesCardSkeleton />
			</div>
		</>
	);
}

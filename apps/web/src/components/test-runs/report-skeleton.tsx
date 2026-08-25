import {
	Card,
	CardContent,
	CardHeader,
} from "@automationstack/ui/components/card";
import { Skeleton } from "@automationstack/ui/components/skeleton";
import type { ReactNode } from "react";

import { StaggerItem } from "@/components/layout/page-stagger";

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
 * 不再收 className：跨列类名整体上移到了 ReportSkeleton 里的 StaggerItem 上。
 * 包了一层之后 grid item 是 StaggerItem 那层，`xl:col-span-*` 留在 <Card> 上会
 * 落在非 grid item 身上，跨列当场失效（成因见 page-stagger.tsx 顶部）。
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

/** 对齐 ReportHeader：面包屑(h-5) + 标题(h-6)。跨整行的类名在下面的 StaggerItem 上。 */
function HeadingSkeleton() {
	return (
		<div className="flex items-center gap-3">
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

/** 对齐 ReportPriorityCard：P0 结论条 + 优先级表（与它同为两列宽，见下面的 StaggerItem）。 */
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
 * 骨架为什么也要逐项错开，而不是整块淡入。
 *
 * 不包 StaggerItem 的话，慢加载这条路**一次错开都不会发生**：这一份骨架挂载时
 * pathname 与上一页不同，PageTransition 判定要播进场，于是骨架整块淡入一次；等真身
 * 就绪，pending 那格里存的已经是本页 pathname，就绪态被判成 followsSamePath，
 * skipEnter 为真——report-view.tsx 那六个 StaggerItem 一个都不动，直接落在终态。
 * 结果是 loader 快（<200ms，router.tsx 的 defaultPendingMs）时逐项错开，慢时整块
 * 淡入，同一个页面两种观感。把错开挪到骨架这边，两条路看到的都是「一页在依次落位」。
 *
 * index 与 report-view.tsx 里逐个对齐，**包括 1 号那个空位**：那一格是提交条的，
 * 而本文件刻意不画提交条（理由见文件头）。留号不重排，两处的排位表因此是同一张，
 * 不需要任何换算——重排的话，「有提交条的就绪态」和「没有提交条的骨架」会给同一张
 * 卡两个不同的序号，骨架换真身那一帧的错位就成了必然。
 *
 * 跨列类名统一写在 StaggerItem 上：包了一层之后它才是 grid item。
 */
export function ReportSkeleton() {
	return (
		<>
			<StaggerItem className="xl:col-span-3" index={0}>
				<HeadingSkeleton />
			</StaggerItem>
			<StaggerItem className="xl:col-span-3" index={2}>
				<SummaryCardSkeleton />
			</StaggerItem>
			<StaggerItem className="xl:col-span-2" index={3}>
				<PriorityCardSkeleton />
			</StaggerItem>
			<StaggerItem index={4}>
				<ResultCardSkeleton />
			</StaggerItem>
			<StaggerItem className="xl:col-span-3" index={5}>
				<ModuleCardSkeleton />
			</StaggerItem>
			<StaggerItem className="xl:col-span-3" index={6}>
				<FailedCasesCardSkeleton />
			</StaggerItem>
		</>
	);
}

import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@automationstack/ui/components/card";
import { lazy, Suspense } from "react";

import {
	REPORT_BARS_BOX,
	reportModuleHeightPx,
} from "@/components/overview/chart-box";
import {
	RESULT_CHART_COLORS,
	type ReportModuleStat,
} from "@/components/test-runs/report-meta";
import { ReportModuleTable } from "@/components/test-runs/report-module-table";
import {
	RESULT_ICONS,
	RESULT_LABELS,
} from "@/components/test-runs/test-run-meta";

/**
 * 图里最多画几个模块。
 *
 * 后端已按失败数倒序返回，所以截断截掉的一定是失败最少的那些——这张图要回答的是
 * 「哪个模块最烂」，尾巴上那串 0 失败的模块只会把柱子压扁。被截掉的模块在下面的
 * 表格里一条不少，卡片描述里也会写明图里只画了前几个。
 */
const MAX_CHART_MODULES = 8;

/**
 * 柱图真身走动态 import：它静态引用 recharts，而这张卡的表格（阻塞/跳过/未测三列
 * 只在表里有）是读数的完整通道，不该为了图把 gzip 103KB 的 recharts 拖进入口 chunk。
 * 完整来龙去脉见 overview-donut.tsx 的头注释，SSR 下为何只用 Suspense 不加 ClientOnly
 * 也在那里。
 */
const LazyReportModuleBarsChart = lazy(async () => {
	const chartModule = await import(
		"@/components/test-runs/report-module-bars-chart"
	);
	return { default: chartModule.ReportModuleBarsChart };
});

/**
 * 高度在这一层算：占位与真身读的是同一个 reportModuleHeightPx，图区不会先塌成
 * 0 高再弹回来（理由见 chart-box.ts）。真身拿它当 style 上的 height。
 */
function ModuleBars({ rows }: { rows: readonly ReportModuleStat[] }) {
	const heightPx = reportModuleHeightPx(rows.length);
	return (
		<Suspense
			fallback={
				<div
					aria-hidden="true"
					className={REPORT_BARS_BOX}
					style={{ height: `${heightPx}px` }}
				/>
			}
		>
			<LazyReportModuleBarsChart heightPx={heightPx} rows={rows} />
		</Suspense>
	);
}

/**
 * 两根柱子各是谁。柱子走语义色（通过绿 / 失败红，亮底均过 3:1，实测见
 * theme.css），颜色本身已分得出；图例这枚标记仍用结论图标（对勾 / 叉）并染成
 * 与柱子相同的颜色——形状是色弱读者的冗余线索，染色则守住图例色等于柱色。
 */
function ModuleLegend() {
	return (
		<p className="flex items-center gap-4 text-muted-foreground text-xs">
			{(["passed", "failed"] as const).map((result) => {
				const Icon = RESULT_ICONS[result];
				return (
					<span className="flex items-center gap-1.5" key={result}>
						<Icon
							aria-hidden="true"
							className="size-3.5"
							style={{ color: RESULT_CHART_COLORS[result].color }}
						/>
						{RESULT_LABELS[result]}
					</span>
				);
			})}
		</p>
	);
}

interface ReportModuleCardProps {
	className?: string;
	modules: readonly ReportModuleStat[];
}

/**
 * 按模块的通过 / 失败对比（plan §7.4 的第 2 张图）：哪个模块最差。
 *
 * 表格是完整数据，图只是它前几行的可视化——所以表格里带上了阻塞、跳过、未测
 * 三列。这三个数字画不进「通过 vs 失败」的对比图，但少了它们就没法解释
 * 一个「通过 2 失败 0」的模块为什么不值得高兴（它可能还有 40 条没测）。
 */
export function ReportModuleCard({
	className,
	modules,
}: ReportModuleCardProps) {
	const chartRows = modules.slice(0, MAX_CHART_MODULES);
	const truncated = modules.length - chartRows.length;

	return (
		<Card className={className}>
			<CardHeader>
				<CardTitle>按模块的通过与失败</CardTitle>
				<CardDescription>
					{truncated > 0
						? `按失败数从多到少排列；图中只画失败最多的 ${MAX_CHART_MODULES} 个模块，另有 ${truncated} 个见下表。`
						: "按失败数从多到少排列。"}
				</CardDescription>
			</CardHeader>
			<CardContent>
				{modules.length === 0 ? (
					<p className="text-muted-foreground text-sm">
						查过了：这个测试任务里的用例没有归到任何模块下。
					</p>
				) : (
					<>
						<ModuleLegend />
						<ModuleBars rows={chartRows} />
						<ReportModuleTable rows={modules} />
					</>
				)}
			</CardContent>
		</Card>
	);
}

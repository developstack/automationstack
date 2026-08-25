import { Badge } from "@automationstack/ui/components/badge";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@automationstack/ui/components/card";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@automationstack/ui/components/table";
import {
	CircleCheckIcon,
	CircleHelpIcon,
	TriangleAlertIcon,
} from "lucide-react";
import { lazy, Suspense } from "react";

import { PRIORITY_BADGE_VARIANTS } from "@/components/cases/case-meta";
import {
	REPORT_BARS_BOX,
	reportPriorityHeightPx,
} from "@/components/overview/chart-box";
import { formatRate, RATE_UNKNOWN } from "@/components/test-runs/rate-format";
import type { ReportPriorityStat } from "@/components/test-runs/report-meta";
import type { ReportPriorityBarsProps } from "@/components/test-runs/report-priority-bars-chart";

/**
 * 柱图真身走动态 import：它静态引用 recharts，而这张卡本身（P0 结论 + 表格）是首屏
 * 就该有的东西，不该为了它把 gzip 103KB 的 recharts 一起拖进入口 chunk。
 * 完整来龙去脉见 overview-donut.tsx 的头注释，SSR 下为何只用 Suspense 不加 ClientOnly
 * 也在那里。
 */
const LazyReportPriorityBarsChart = lazy(async () => {
	const chartModule = await import(
		"@/components/test-runs/report-priority-bars-chart"
	);
	return { default: chartModule.ReportPriorityBarsChart };
});

/**
 * 高度在这一层算：占位与真身读的是同一个 reportPriorityHeightPx，图区不会先塌成
 * 0 高再弹回来（理由见 chart-box.ts）。真身拿它当 style 上的 height。
 */
function PriorityBars({ rows }: Pick<ReportPriorityBarsProps, "rows">) {
	const heightPx = reportPriorityHeightPx(rows.length);
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
			<LazyReportPriorityBarsChart heightPx={heightPx} rows={rows} />
		</Suspense>
	);
}

const P0_LINE_CLASS = "flex items-start gap-2 rounded-md px-3 py-2 text-sm";

/**
 * P0 一句话结论。**这是整页最该先看到的一行**：P0 有没有失败就是上线红线。
 *
 * 三种状态必须分开说，尤其是第三种：P0 一条通过/失败结论都还没有时，
 * 既不能报「有失败」也**绝不能**报「暂无失败」——那会被读成绿灯，
 * 而此刻我们对 P0 一无所知。它和「测了都过了」是完全不同的两件事。
 */
function P0Verdict({ stat }: { stat: ReportPriorityStat | undefined }) {
	if (stat === undefined) {
		return (
			<p className={`${P0_LINE_CLASS} bg-muted text-muted-foreground`}>
				<CircleHelpIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
				这个测试任务里没有 P0 用例，无法据此判断上线红线。
			</p>
		);
	}
	if (stat.failed > 0) {
		return (
			<p className={`${P0_LINE_CLASS} bg-destructive/10 text-destructive`}>
				<TriangleAlertIcon
					aria-hidden="true"
					className="mt-0.5 size-4 shrink-0"
				/>
				{`P0 有 ${stat.failed} 条失败 —— 上线红线已触发，明细见本页底部的失败用例清单。`}
			</p>
		);
	}
	if (stat.passed === 0) {
		return (
			<p className={`${P0_LINE_CLASS} bg-muted text-muted-foreground`}>
				<CircleHelpIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
				{`P0 共 ${stat.total} 条，还没有任何「通过 / 失败」结论——红线状态未知，这不等于没问题。`}
			</p>
		);
	}
	return (
		<p className={`${P0_LINE_CLASS} bg-muted text-foreground`}>
			<CircleCheckIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
			{`P0 共 ${stat.total} 条，已测出 ${stat.passed} 条通过、0 条失败；另有 ${stat.total - stat.passed} 条尚无「通过 / 失败」结论。`}
		</p>
	);
}

function PriorityTable({ rows }: { rows: readonly ReportPriorityStat[] }) {
	return (
		<Table>
			<TableHeader>
				<TableRow>
					<TableHead className="w-16">优先级</TableHead>
					<TableHead className="w-16 text-right">总数</TableHead>
					<TableHead className="w-16 text-right">通过</TableHead>
					<TableHead className="w-16 text-right">失败</TableHead>
					<TableHead className="text-right">通过率</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{rows.map((row) => (
					<TableRow key={row.priority}>
						<TableCell>
							<Badge variant={PRIORITY_BADGE_VARIANTS[row.priority]}>
								{row.priority}
							</Badge>
						</TableCell>
						<TableCell className="text-right tabular-nums">
							{row.total}
						</TableCell>
						<TableCell className="text-right tabular-nums">
							{row.passed}
						</TableCell>
						<TableCell className="text-right tabular-nums">
							{row.failed}
						</TableCell>
						<TableCell className="text-right tabular-nums">
							{formatRate(row.passRate)}
						</TableCell>
					</TableRow>
				))}
			</TableBody>
		</Table>
	);
}

interface ReportPriorityCardProps {
	className?: string;
	priorities: readonly ReportPriorityStat[];
}

/**
 * 按优先级的通过率（plan §7.4 的第 3 张图，也是最该显眼的一张）。
 *
 * 排在三张图的第一位、占最宽的一格：这一页别的数字都是「进度怎么样」，
 * 只有这一张回答「能不能上线」。
 *
 * 柱图只画 `passRate !== null` 的档。分母为 0 的档若照画，会得到一根长度为 0 的柱子，
 * 视觉上和「通过率 0%」一模一样——而它的含义恰恰是「无从判断」。
 * 那些档在下面的表格里以「—」如实出现，一条都不会丢。
 */
export function ReportPriorityCard({
	className,
	priorities,
}: ReportPriorityCardProps) {
	const p0 = priorities.find((row) => row.priority === "P0");
	const chartRows = priorities
		.filter((row) => row.passRate !== null)
		.map((row) => ({ passRate: row.passRate ?? 0, priority: row.priority }));

	return (
		<Card className={className}>
			<CardHeader>
				<CardTitle>按优先级的通过率</CardTitle>
				<CardDescription>
					{`分母只算「通过 + 失败」，阻塞与跳过不计入；${RATE_UNKNOWN} 表示该档还没有可判断的结论。`}
				</CardDescription>
			</CardHeader>
			<CardContent>
				<P0Verdict stat={p0} />
				{priorities.length === 0 ? (
					<p className="text-muted-foreground text-sm">
						查过了：这个测试任务里一条用例都没有。
					</p>
				) : (
					<>
						{chartRows.length > 0 ? <PriorityBars rows={chartRows} /> : null}
						<PriorityTable rows={priorities} />
					</>
				)}
			</CardContent>
		</Card>
	);
}

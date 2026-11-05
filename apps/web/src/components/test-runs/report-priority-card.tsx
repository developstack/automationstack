import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@automationstack/ui/components/card";
import {
	CircleCheckIcon,
	CircleHelpIcon,
	TriangleAlertIcon,
} from "lucide-react";
import { lazy, Suspense } from "react";

import {
	REPORT_BARS_BOX,
	reportPriorityHeightPx,
} from "@/components/overview/chart-box";
import { RATE_UNKNOWN } from "@/components/test-runs/rate-format";
import type { ReportPriorityStat } from "@/components/test-runs/report-meta";
import type { ReportPriorityBarsProps } from "@/components/test-runs/report-priority-bars-chart";
import { ReportPriorityTable } from "@/components/test-runs/report-priority-table";

const LazyReportPriorityBarsChart = lazy(async () => {
	const chartModule = await import(
		"@/components/test-runs/report-priority-bars-chart"
	);
	return { default: chartModule.ReportPriorityBarsChart };
});

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
			<p
				className={`${P0_LINE_CLASS} bg-destructive-soft text-destructive-soft-foreground`}
			>
				<TriangleAlertIcon
					aria-hidden="true"
					className="mt-0.5 size-4 shrink-0"
				/>
				{`P0 有 ${stat.failed} 条失败 —— 上线红线已触发，明细见本页底部的失败和阻塞用例清单。`}
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

interface ReportPriorityCardProps {
	className?: string;
	priorities: readonly ReportPriorityStat[];
}

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
						<ReportPriorityTable rows={priorities} />
					</>
				)}
			</CardContent>
		</Card>
	);
}

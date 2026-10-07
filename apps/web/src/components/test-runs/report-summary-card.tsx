import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@automationstack/ui/components/card";
import { Separator } from "@automationstack/ui/components/separator";

import { formatRate, RATE_UNKNOWN } from "@/components/test-runs/rate-format";
import { ReportCounts } from "@/components/test-runs/report-counts";
import type { TestRunReportView } from "@/components/test-runs/report-meta";

interface RateProps {
	basis: string;
	label: string;
	rate: number | null;
}

function ReportRate({ basis, label, rate }: RateProps) {
	return (
		<div className="flex flex-col gap-0.5">
			<dt className="text-muted-foreground text-sm">{label}</dt>
			<dd className="font-semibold text-3xl tabular-nums">
				{formatRate(rate)}
			</dd>
			<p className="text-muted-foreground text-xs">{basis}</p>
		</div>
	);
}

function passRateBasis(report: TestRunReportView): string {
	const { blocked, failed, passed, skipped } = report.counts;
	if (report.passRate === null) {
		return `还没有「通过」或「失败」的结论（阻塞 ${blocked} · 跳过 ${skipped}），通过率无从谈起——这不等于 0%`;
	}
	return `${passed} / ${passed + failed} 条（通过 ÷ 通过+失败；阻塞 ${blocked}、跳过 ${skipped} 不计入分母）`;
}

function completionRateBasis(report: TestRunReportView): string {
	const { total, untested } = report.counts;
	if (report.completionRate === null) {
		return "这个测试任务里没有用例，完成率无从谈起";
	}
	return `${total - untested} / ${total} 条已有结论（通过、失败、阻塞、跳过都算）`;
}

interface ReportSummaryCardProps {
	report: TestRunReportView;
}

export function ReportSummaryCard({ report }: ReportSummaryCardProps) {
	return (
		<Card>
			<CardHeader>
				<CardTitle>报告概览</CardTitle>
				<CardDescription>
					「已完成」只表示全部测完，不代表全部通过。下面两个率的分母不同，请分别读。
				</CardDescription>
			</CardHeader>
			<CardContent>
				<ReportCounts
					automatedCount={report.automatedCount}
					counts={report.counts}
				/>
				<Separator />
				<dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
					<ReportRate
						basis={completionRateBasis(report)}
						label="完成率"
						rate={report.completionRate}
					/>
					<ReportRate
						basis={passRateBasis(report)}
						label="通过率"
						rate={report.passRate}
					/>
				</dl>
				{report.passRate === null || report.completionRate === null ? (
					<p className="sr-only">{`${RATE_UNKNOWN} 表示该比率的分母为 0，无法计算，不是 0%`}</p>
				) : null}
			</CardContent>
		</Card>
	);
}

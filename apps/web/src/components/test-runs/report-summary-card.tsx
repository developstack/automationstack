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
	/** 分子分母写成一句人话。率是个比值，不写出分母就没法复核它算的是什么。 */
	basis: string;
	label: string;
	rate: number | null;
}

/**
 * 一个率。**分母永远和它一起显示**：这一页有两个率，它们的分母完全不同
 * （plan §2.4），只给两个百分数会让人默认它们是同一批用例的两种切法。
 *
 * `rate` 为 null 时读数是「—」，`basis` 那行负责解释为什么没有数
 * ——绝不显示「0%」，那是一句关于质量的强判断，而此刻我们一无所知。
 */
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

/** 通过率分母为 0 时那行解释；不能只留一个破折号让人猜。 */
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

/**
 * 四个大数字 + 两个率（plan §7.4 的 1 与 2）。
 *
 * 两个率**必须分开展示、口径不许混**，所以它们排在四个计数之后、隔一条分隔线，
 * 而且各自带着自己的分母。把它们和「通过 30」这类计数混排在同一行，
 * 就会有人把「通过 30 / 总数 120 = 25%」当成通过率读。
 *
 * 「阻塞+跳过」合成一格：它们是同一类东西——逃生口，代表「没测成」而不是
 * 「测了不合格」，拆成两格会让人误以为它们各自是一种质量结论。
 */
export function ReportSummaryCard({ report }: ReportSummaryCardProps) {
	return (
		<Card>
			<CardHeader>
				<CardTitle>报告概览</CardTitle>
				{/*
				 * 这一句是 plan §2.4 的硬要求，位置就该在最上面：「已完成」只表示
				 * 都测完了，页面任何地方都不许暗示「都通过了」。
				 */}
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
				{/*
				 * 读屏用户拿不到「大字 + 小字」的视觉分组，这里把两个率各自的
				 * 完整口径再念一遍会更吵；`—` 本身却是个念不出意思的符号，
				 * 所以只给它补一句。
				 */}
				{report.passRate === null || report.completionRate === null ? (
					<p className="sr-only">{`${RATE_UNKNOWN} 表示该比率的分母为 0，无法计算，不是 0%`}</p>
				) : null}
			</CardContent>
		</Card>
	);
}

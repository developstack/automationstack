import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@automationstack/ui/components/card";
import { Separator } from "@automationstack/ui/components/separator";

import { formatRate, RATE_UNKNOWN } from "@/components/test-runs/rate-format";
import type { TestRunReportView } from "@/components/test-runs/report-meta";

interface StatProps {
	/** 读数下面那行小字：这个数字是怎么来的。 */
	hint: string;
	label: string;
	value: string;
}

/**
 * 一个大读数。`dt` 在上、`dd` 在下，但视觉上读数更大——
 * DOM 顺序按「标签 → 值」排，读屏念出来才是「总用例 120」而不是「120 总用例」。
 * 数字全部 tabular-nums：四个格子并排时，比例字体的数字宽度不一，
 * 换一组数据整行就会左右抖动。
 */
function ReportStat({ hint, label, value }: StatProps) {
	return (
		<div className="flex flex-col gap-0.5">
			<dt className="text-muted-foreground text-sm">{label}</dt>
			<dd className="font-semibold text-3xl tabular-nums">{value}</dd>
			<p className="text-muted-foreground text-xs">{hint}</p>
		</div>
	);
}

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

/**
 * 顶部那一行灰字：「其中 N 条由脚本执行」（plan §6.1）。
 *
 * **就只是一行灰字**：不出卡片、不单独算率、头条数字不分栏（D26）。一个迭代
 * 对外汇报的就是「这个迭代的通过率」，拆成手工/自动化两个数会让报告立刻失去
 * 可引用性——别人问「这迭代测得怎么样」，答不上一个数。执行方式的分布放在
 * 这里一句话交代完，细节在页面底部的「自动化执行记录」块里。
 *
 * 它也**不参与任何率的分子分母**：通过率的分母仍然不含阻塞与跳过，
 * 完成率仍然是「有结论 ÷ 总数」，算法一个字没改（口径在 test-run-metrics-core.ts）。
 *
 * 一条都没有时不渲染：纯手工的测试任务是常态，常驻一句「其中 0 条由脚本执行」
 * 只是噪声。有脚本参与时这一句才是信息。
 */
function AutomatedNote({ automatedCount }: { automatedCount: number }) {
	if (automatedCount === 0) {
		return null;
	}
	return (
		<p className="text-muted-foreground text-xs">
			{`其中 ${automatedCount} 条由脚本执行（明细见页面底部的「自动化执行记录」）。执行方式不影响上面的数字，也不单独算率。`}
		</p>
	);
}

/**
 * 四个大数字那一组，连同下面那行灰字。
 *
 * 单独拆成一个组件，是因为「四个计数」与「两个率」本就是两件事：它们之间隔着
 * 一条分隔线，口径也完全不同（计数是条数，率是比值且各有各的分母）。
 */
function ReportCounts({
	automatedCount,
	counts,
}: {
	automatedCount: number;
	counts: TestRunReportView["counts"];
}) {
	const { blocked, failed, passed, skipped, total } = counts;
	return (
		<>
			<dl className="grid grid-cols-2 gap-4 md:grid-cols-4">
				<ReportStat
					hint="这个测试任务当前覆盖的用例条数"
					label="总用例"
					value={String(total)}
				/>
				<ReportStat hint="测了并且合格" label="通过" value={String(passed)} />
				<ReportStat
					hint="测了但不合格，清单见页面底部"
					label="失败"
					value={String(failed)}
				/>
				<ReportStat
					hint={`阻塞 ${blocked} · 跳过 ${skipped}，都属于「没测成」`}
					label="阻塞 + 跳过"
					value={String(blocked + skipped)}
				/>
			</dl>
			<AutomatedNote automatedCount={automatedCount} />
		</>
	);
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

import type { TestRunReportView } from "@/components/test-runs/report-meta";

/**
 * 报告概览卡上半截：四个大数字那一组（从 report-summary-card.tsx 拆出来）。
 *
 * 单个读数与「其中 N 条由脚本执行」那行灰字只服务于这一组，跟着一起搬过来。
 */

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
export function ReportCounts({
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

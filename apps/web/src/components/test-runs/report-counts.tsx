import type { TestRunReportView } from "@/components/test-runs/report-meta";

interface StatProps {
	hint: string;
	label: string;
	value: string;
}

function ReportStat({ hint, label, value }: StatProps) {
	return (
		<div className="flex flex-col gap-0.5">
			<dt className="text-muted-foreground text-sm">{label}</dt>
			<dd className="font-semibold text-3xl tabular-nums">{value}</dd>
			<p className="text-muted-foreground text-xs">{hint}</p>
		</div>
	);
}

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

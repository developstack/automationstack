import type { TestRunCaseResult } from "@automationstack/db/schema/test-runs";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@automationstack/ui/components/card";

import { OverviewDonut } from "@/components/overview/overview-donut";
import { formatShare } from "@/components/test-runs/rate-format";
import {
	CONCLUDED_RESULTS,
	RESULT_CHART_COLORS,
	type TestRunReportView,
} from "@/components/test-runs/report-meta";
import {
	RESULT_ICONS,
	RESULT_LABELS,
} from "@/components/test-runs/test-run-meta";

const LEGEND_RESULTS: readonly TestRunCaseResult[] = [
	...CONCLUDED_RESULTS,
	"untested",
];

interface LegendRowProps {
	count: number;
	result: TestRunCaseResult;
	total: number;
}

function LegendRow({ count, result, total }: LegendRowProps) {
	const Icon = RESULT_ICONS[result];
	return (
		<div className="flex items-center justify-between gap-2 text-sm">
			<dt className="flex items-center gap-2 text-muted-foreground">
				<Icon
					aria-hidden="true"
					className="size-4 shrink-0"
					style={{ color: RESULT_CHART_COLORS[result].color }}
				/>
				{RESULT_LABELS[result]}
			</dt>
			<dd className="tabular-nums">
				{count}
				<span className="ml-2 text-muted-foreground text-xs">
					{formatShare(count, total)}
				</span>
			</dd>
		</div>
	);
}

interface ReportResultCardProps {
	report: TestRunReportView;
}

export function ReportResultCard({ report }: ReportResultCardProps) {
	const { counts } = report;

	return (
		<Card>
			<CardHeader>
				<CardTitle>结果分布</CardTitle>
				<CardDescription>四种结论各占多少，外加还没测的部分</CardDescription>
			</CardHeader>
			<CardContent>
				{counts.total === 0 ? (
					<p className="text-muted-foreground text-sm">
						查过了：这个测试任务里一条用例都没有，画不出分布。
					</p>
				) : (
					<>
						<OverviewDonut
							centerLabel="条用例"
							centerValue={String(counts.total)}
							slices={CONCLUDED_RESULTS.map((result) => ({
								color: RESULT_CHART_COLORS[result].color,
								key: result,
								label: RESULT_LABELS[result],
								value: counts[result],
							}))}
							trackValue={counts.untested}
						/>
						<p className="sr-only">{`共 ${counts.total} 条用例`}</p>
						<dl className="flex flex-col gap-1.5">
							{LEGEND_RESULTS.map((result) => (
								<LegendRow
									count={counts[result]}
									key={result}
									result={result}
									total={counts.total}
								/>
							))}
						</dl>
					</>
				)}
			</CardContent>
		</Card>
	);
}

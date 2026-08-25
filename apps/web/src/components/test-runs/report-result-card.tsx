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

/** 图例里每一行的顺序：四种结论按报告的阅读次序，未测垫最后（它是轨道）。 */
const LEGEND_RESULTS: readonly TestRunCaseResult[] = [
	...CONCLUDED_RESULTS,
	"untested",
];

interface LegendRowProps {
	count: number;
	result: TestRunCaseResult;
	total: number;
}

/**
 * 图例的一行。
 *
 * 图标既是形状线索也是色块：它用的就是这一段圆弧的颜色，读者才能把某段弧
 * 对上某一行（同 overview-totals-card.tsx 里那条「图例色必须等于扇区色」的约定）。
 * 取色因此仍走 `RESULT_CHART_COLORS`（--result-* 四支），不借执行台的
 * `RESULT_TEXT_CLASSES`——那套是 text-success / text-amber-600 等另一组取值，
 * 混用会让环上的绿和图例里的绿是两种绿，又对不上号了。
 *
 * 形状（对勾 / 叉 / 斜杠 / 减号 / 空心虚线）本身就区分五态，
 * 这很重要：四色里的黄与浅灰在亮底压卡面只有 1.39:1 / 1.78:1（实测见
 * theme.css），单凭颜色认不出哪段是哪段——文字标签与数字才是主编码。
 */
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

/**
 * 结果分布环形图（plan §7.4 的第 1 张图）。
 *
 * 环整块 aria-hidden，读数由下面的 `dl` 给出——这是本目录既有的处理
 * （见 overview-donut.tsx 的头注释）：SVG 里的一切读屏都拿不到，
 * 而图例本来就把同一份数字写全了，播两遍只会更吵。
 *
 * 「未测」走环的轨道段而不是一个数据扇区：它不是结论，
 * 视觉上让它当底色、四种结论压在上面，一眼看到的就是「还剩多少没测」。
 */
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
						{/* 环心那个总数是 SVG 文本、且整块 aria-hidden，这里补一份文字等价物。 */}
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

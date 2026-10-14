import { CONCLUDED_RESULTS } from "@automationstack/db/repositories/project-stats-definitions";
import type {
	ExecutionTrendPoint,
	ExecutionTrendStats,
} from "@automationstack/db/repositories/project-stats-trend-core";
import { useQuery } from "@tanstack/react-query";

import { ChartSuspense } from "@/components/overview/chart-suspense";
import { toTrendRows } from "@/components/overview/overview-chart";
import { OverviewEmpty } from "@/components/overview/overview-empty";
import {
	NARROW_CARD,
	STACKED_CHART_BOX,
	TREND_CARD_CONTENT,
} from "@/components/overview/overview-layout";
import { LazyExecutionTrendChart } from "@/components/overview/overview-lazy-charts";
import {
	TREND_BUCKET_TEXT,
	TREND_SPAN_TEXT,
} from "@/components/overview/overview-metrics";
import { OverviewQuery } from "@/components/overview/overview-query";
import { OverviewSection } from "@/components/overview/overview-section";
import { TrendCardSkeleton } from "@/components/overview/trend-card-skeleton";
import {
	type TrendSrColumn,
	TrendSrTable,
} from "@/components/overview/trend-sr-table";
import { RESULT_LABELS } from "@/components/test-runs/test-run-meta";
import { orpc } from "@/utils/orpc";

export const EXECUTION_TREND_CARD_TITLE = "每周执行结果";

const SR_COLUMNS: readonly TrendSrColumn<ExecutionTrendPoint>[] =
	CONCLUDED_RESULTS.map((result) => ({
		countOf: (point) => point[result],
		key: result,
		label: RESULT_LABELS[result],
	}));

interface ExecutionTrendContentProps {
	data: ExecutionTrendStats;
	projectId: string;
}

function ExecutionTrendContent({
	data,
	projectId,
}: ExecutionTrendContentProps) {
	const rows = toTrendRows(data.points);
	const empty = data.points.every((point) =>
		CONCLUDED_RESULTS.every((result) => point[result] === 0)
	);
	if (empty) {
		return (
			<OverviewEmpty projectId={projectId} target="testRuns">
				{`${TREND_SPAN_TEXT}没有执行结果。在测试任务中执行用例后，这里显示每周的执行结果。`}
			</OverviewEmpty>
		);
	}
	return (
		<div className={TREND_CARD_CONTENT}>
			<ChartSuspense boxClassName={STACKED_CHART_BOX}>
				<LazyExecutionTrendChart points={data.points} />
			</ChartSuspense>
			<TrendSrTable
				caption={`每个${TREND_BUCKET_TEXT}的执行结果`}
				columns={SR_COLUMNS}
				rows={rows}
			/>
		</div>
	);
}

interface OverviewExecutionTrendCardProps {
	projectId: string;
}

/** M6 每周执行结果：堆叠柱状图。 */
export function OverviewExecutionTrendCard({
	projectId,
}: OverviewExecutionTrendCardProps) {
	const query = useQuery(
		orpc.projectStats.executionTrend.queryOptions({ input: { projectId } })
	);

	return (
		<OverviewQuery
			className={NARROW_CARD}
			query={query}
			skeleton={
				<TrendCardSkeleton bigNumber={false} chartBox={STACKED_CHART_BOX} />
			}
			title={EXECUTION_TREND_CARD_TITLE}
		>
			{(data) => (
				<OverviewSection
					className={NARROW_CARD}
					description={`每个${TREND_BUCKET_TEXT}内有结论的执行结果。一条用例在一个测试任务中只计算最后一次`}
					title={EXECUTION_TREND_CARD_TITLE}
				>
					<ExecutionTrendContent data={data} projectId={projectId} />
				</OverviewSection>
			)}
		</OverviewQuery>
	);
}

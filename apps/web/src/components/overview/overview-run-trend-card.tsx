import { RECENT_WINDOW_DAYS } from "@automationstack/db/repositories/project-stats-definitions";
import type {
	RunTrendPoint,
	RunTrendStats,
} from "@automationstack/db/repositories/project-stats-trend-core";
import { useQuery } from "@tanstack/react-query";

import { BigNumber } from "@/components/overview/big-number";
import { ChartSuspense } from "@/components/overview/chart-suspense";
import { toTrendRows } from "@/components/overview/overview-chart";
import { OverviewEmpty } from "@/components/overview/overview-empty";
import {
	NARROW_CARD,
	STACKED_CHART_BOX,
	TREND_CARD_CONTENT,
} from "@/components/overview/overview-layout";
import { LazyRunTrendChart } from "@/components/overview/overview-lazy-charts";
import {
	formatCount,
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
import { orpc } from "@/utils/orpc";

export const RUN_TREND_CARD_TITLE = "测试任务新建和完成";

const SR_COLUMNS: readonly TrendSrColumn<RunTrendPoint>[] = [
	{ countOf: (point) => point.created, key: "created", label: "新建" },
	{ countOf: (point) => point.completed, key: "completed", label: "完成" },
];

interface RunTrendContentProps {
	data: RunTrendStats;
	projectId: string;
}

function RunTrendContent({ data, projectId }: RunTrendContentProps) {
	const empty = data.points.every(
		(point) => point.created === 0 && point.completed === 0
	);
	if (empty) {
		return (
			<OverviewEmpty projectId={projectId} target="testRuns">
				{`${TREND_SPAN_TEXT}没有新建或完成的测试任务。新建测试任务后，这里比较新建和完成的速度。`}
			</OverviewEmpty>
		);
	}
	return (
		<div className={TREND_CARD_CONTENT}>
			<BigNumber
				caption={`过去 ${RECENT_WINDOW_DAYS} 天完成的测试任务`}
				unit="个"
				value={formatCount(data.completedLast7Days)}
			/>
			<ChartSuspense boxClassName={STACKED_CHART_BOX}>
				<LazyRunTrendChart points={data.points} />
			</ChartSuspense>
			<TrendSrTable
				caption={`每个${TREND_BUCKET_TEXT}新建和完成的测试任务`}
				columns={SR_COLUMNS}
				rows={toTrendRows(data.points)}
			/>
		</div>
	);
}

interface OverviewRunTrendCardProps {
	projectId: string;
}

/** M7 测试任务新建和完成趋势：两条折线。完成按最后一次进入已完成的时间统计。 */
export function OverviewRunTrendCard({ projectId }: OverviewRunTrendCardProps) {
	const query = useQuery(
		orpc.projectStats.runTrend.queryOptions({ input: { projectId } })
	);

	return (
		<OverviewQuery
			className={NARROW_CARD}
			query={query}
			skeleton={<TrendCardSkeleton bigNumber chartBox={STACKED_CHART_BOX} />}
			title={RUN_TREND_CARD_TITLE}
		>
			{(data) => (
				<OverviewSection
					className={NARROW_CARD}
					description={`每个${TREND_BUCKET_TEXT}新建和完成的测试任务数。完成按进入已完成的时间统计`}
					title={RUN_TREND_CARD_TITLE}
				>
					<RunTrendContent data={data} projectId={projectId} />
				</OverviewSection>
			)}
		</OverviewQuery>
	);
}

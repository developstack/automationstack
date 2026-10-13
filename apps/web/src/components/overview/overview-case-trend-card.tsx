import { RECENT_WINDOW_DAYS } from "@automationstack/db/repositories/project-stats-definitions";
import type {
	CaseTrendPoint,
	CaseTrendStats,
} from "@automationstack/db/repositories/project-stats-trend-core";
import { useQuery } from "@tanstack/react-query";

import { BigNumber } from "@/components/overview/big-number";
import { ChartSuspense } from "@/components/overview/chart-suspense";
import { toTrendRows } from "@/components/overview/overview-chart";
import { OverviewEmpty } from "@/components/overview/overview-empty";
import {
	NARROW_CARD,
	TREND_CARD_CONTENT,
	TREND_CHART_BOX,
} from "@/components/overview/overview-layout";
import { LazyCaseTrendChart } from "@/components/overview/overview-lazy-charts";
import {
	compareWithPrevious,
	formatCount,
} from "@/components/overview/overview-metrics";
import { OverviewQuery } from "@/components/overview/overview-query";
import { OverviewSection } from "@/components/overview/overview-section";
import { TrendCardSkeleton } from "@/components/overview/trend-card-skeleton";
import {
	type TrendSrColumn,
	TrendSrTable,
} from "@/components/overview/trend-sr-table";
import { orpc } from "@/utils/orpc";

export const CASE_TREND_CARD_TITLE = "新增用例";

const SR_COLUMNS: readonly TrendSrColumn<CaseTrendPoint>[] = [
	{ countOf: (point) => point.created, key: "created", label: "新增用例" },
];

interface CaseTrendContentProps {
	data: CaseTrendStats;
	projectId: string;
}

function CaseTrendContent({ data, projectId }: CaseTrendContentProps) {
	const quiet =
		data.modifiedLast7Days === 0 &&
		data.points.every((point) => point.created === 0);
	if (quiet) {
		return (
			<OverviewEmpty projectId={projectId}>
				过去 12 个 7 天区间没有新增用例，过去 {RECENT_WINDOW_DAYS}{" "}
				天也没有修改用例。在用例管理新建或导入用例后，这里显示趋势。
			</OverviewEmpty>
		);
	}
	return (
		<div className={TREND_CARD_CONTENT}>
			<BigNumber
				caption={
					<>
						<p>
							{compareWithPrevious(
								data.createdLast7Days,
								data.createdPrevious7Days
							)}
						</p>
						<p>{`过去 ${RECENT_WINDOW_DAYS} 天修改 ${formatCount(data.modifiedLast7Days)} 条`}</p>
					</>
				}
				unit={`条，过去 ${RECENT_WINDOW_DAYS} 天`}
				value={formatCount(data.createdLast7Days)}
			/>
			<ChartSuspense boxClassName={TREND_CHART_BOX}>
				<LazyCaseTrendChart points={data.points} />
			</ChartSuspense>
			<TrendSrTable
				caption="每个 7 天区间的新增用例"
				columns={SR_COLUMNS}
				rows={toTrendRows(data.points)}
			/>
		</div>
	);
}

interface OverviewCaseTrendCardProps {
	projectId: string;
}

/** M2 新增用例：大数字和 12 个 7 天区间的面积图。 */
export function OverviewCaseTrendCard({
	projectId,
}: OverviewCaseTrendCardProps) {
	const query = useQuery(
		orpc.projectStats.caseTrend.queryOptions({ input: { projectId } })
	);

	return (
		<OverviewQuery
			className={NARROW_CARD}
			query={query}
			skeleton={<TrendCardSkeleton bigNumber chartBox={TREND_CHART_BOX} />}
			title={CASE_TREND_CARD_TITLE}
		>
			{(data) => (
				<OverviewSection
					className={NARROW_CARD}
					description="包含导入的用例和所有用例状态"
					title={CASE_TREND_CARD_TITLE}
				>
					<CaseTrendContent data={data} projectId={projectId} />
				</OverviewSection>
			)}
		</OverviewQuery>
	);
}

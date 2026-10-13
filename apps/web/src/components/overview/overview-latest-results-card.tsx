import {
	CONCLUDED_RESULTS,
	EXECUTION_WINDOW_DAYS,
} from "@automationstack/db/repositories/project-stats-definitions";
import type { LatestResultsStats } from "@automationstack/db/repositories/project-stats-latest-core";
import { useQuery } from "@tanstack/react-query";

import { CountLegend } from "@/components/overview/count-legend";
import { OverviewDonut } from "@/components/overview/overview-donut";
import { OverviewEmpty } from "@/components/overview/overview-empty";
import {
	NARROW_CARD,
	RING_CARD_CONTENT,
} from "@/components/overview/overview-layout";
import { formatCount } from "@/components/overview/overview-metrics";
import { OverviewQuery } from "@/components/overview/overview-query";
import { OverviewSection } from "@/components/overview/overview-section";
import { RingCardSkeleton } from "@/components/overview/ring-card-skeleton";
import { StatusBadge } from "@/components/status/status-badge";
import { RESULT_CHART_COLORS } from "@/components/test-runs/report-meta";
import { RESULT_LABELS } from "@/components/test-runs/test-run-meta";
import { orpc } from "@/utils/orpc";

export const LATEST_RESULTS_CARD_TITLE = "最新执行结果";

function highPriorityNote(count: number): string {
	return count === 0
		? "没有最新执行结果是失败的 P0/P1 用例"
		: `其中 ${formatCount(count)} 条 P0/P1 用例失败`;
}

interface LatestResultsContentProps {
	data: LatestResultsStats;
	projectId: string;
}

function LatestResultsContent({ data, projectId }: LatestResultsContentProps) {
	if (data.caseCount === 0) {
		return (
			<OverviewEmpty projectId={projectId} target="testRuns">
				过去 {EXECUTION_WINDOW_DAYS}{" "}
				天没有生效用例的执行结果。在测试任务中执行用例后，这里显示每条用例最新的执行结果。
			</OverviewEmpty>
		);
	}
	return (
		<div className={RING_CARD_CONTENT}>
			<OverviewDonut
				centerLabel="条失败或阻塞"
				centerValue={formatCount(data.failedOrBlockedCount)}
				slices={CONCLUDED_RESULTS.map((result) => ({
					color: RESULT_CHART_COLORS[result].color,
					key: result,
					label: RESULT_LABELS[result],
					value: data.counts[result],
				}))}
			/>
			<p className="sr-only">{`${formatCount(data.failedOrBlockedCount)} 条失败或阻塞`}</p>
			<CountLegend
				items={CONCLUDED_RESULTS.map((result) => ({
					color: RESULT_CHART_COLORS[result].color,
					count: data.counts[result],
					key: result,
					label: <StatusBadge kind="result" value={result} />,
				}))}
				total={data.caseCount}
			/>
			<p className="self-start text-muted-foreground text-xs">
				{highPriorityNote(data.highPriorityFailedCount)}
			</p>
		</div>
	);
}

interface OverviewLatestResultsCardProps {
	projectId: string;
}

/** M5 生效用例的最新执行结果：圆环图，中心是失败和阻塞的条数之和。 */
export function OverviewLatestResultsCard({
	projectId,
}: OverviewLatestResultsCardProps) {
	const query = useQuery(
		orpc.projectStats.latestResults.queryOptions({ input: { projectId } })
	);

	return (
		<OverviewQuery
			className={NARROW_CARD}
			query={query}
			skeleton={<RingCardSkeleton legendRows={CONCLUDED_RESULTS.length} />}
			title={LATEST_RESULTS_CARD_TITLE}
		>
			{(data) => (
				<OverviewSection
					className={NARROW_CARD}
					description={`过去 ${EXECUTION_WINDOW_DAYS} 天有结论的生效用例，每条用例只取最新的执行结果`}
					title={LATEST_RESULTS_CARD_TITLE}
				>
					<LatestResultsContent data={data} projectId={projectId} />
				</OverviewSection>
			)}
		</OverviewQuery>
	);
}

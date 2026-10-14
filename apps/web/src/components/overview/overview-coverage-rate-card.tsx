import { EXECUTION_WINDOW_DAYS } from "@automationstack/db/repositories/project-stats-definitions";
import type { ExecutionCoverageStats } from "@automationstack/db/repositories/project-stats-execution";
import { useQuery } from "@tanstack/react-query";
import { DONUT_BOX } from "@/components/overview/chart-box";
import { ChartSuspense } from "@/components/overview/chart-suspense";
import { COVERAGE_RING_COLORS } from "@/components/overview/overview-chart";
import { OverviewEmpty } from "@/components/overview/overview-empty";
import {
	NARROW_CARD,
	RING_CARD_CONTENT,
} from "@/components/overview/overview-layout";
import { LazyCoverageRateChart } from "@/components/overview/overview-lazy-charts";
import {
	formatCount,
	sharePercent,
} from "@/components/overview/overview-metrics";
import { OverviewQuery } from "@/components/overview/overview-query";
import { OverviewSection } from "@/components/overview/overview-section";
import { RingCardSkeleton } from "@/components/overview/ring-card-skeleton";
import { orpc } from "@/utils/orpc";

export const COVERAGE_RATE_CARD_TITLE = "执行覆盖率";

interface RateRowProps {
	color: string;
	executed: number;
	label: string;
	total: number;
}

function RateRow({ color, executed, label, total }: RateRowProps) {
	return (
		<div className="flex items-center justify-between gap-2 text-sm">
			<dt className="flex items-center gap-2">
				<span
					aria-hidden="true"
					className="size-2.5 shrink-0 rounded-full"
					style={{ backgroundColor: color }}
				/>
				{label}
			</dt>
			<dd className="numeric">
				{total === 0 ? "没有用例" : `${sharePercent(executed, total)}%`}
				<span className="ml-2 text-muted-foreground text-xs">
					{`${formatCount(executed)} / ${formatCount(total)}`}
				</span>
			</dd>
		</div>
	);
}

interface CoverageRateContentProps {
	data: ExecutionCoverageStats;
	projectId: string;
}

function CoverageRateContent({ data, projectId }: CoverageRateContentProps) {
	if (data.activeCount === 0) {
		return (
			<OverviewEmpty projectId={projectId}>
				还没有生效用例。把草稿评审为生效后，这里显示生效用例的执行覆盖率。
			</OverviewEmpty>
		);
	}
	return (
		<div className={RING_CARD_CONTENT}>
			<ChartSuspense boxClassName={DONUT_BOX}>
				<LazyCoverageRateChart
					allPercent={sharePercent(data.executedCount, data.activeCount)}
					highPercent={sharePercent(
						data.highPriorityExecutedCount,
						data.highPriorityActiveCount
					)}
				/>
			</ChartSuspense>
			<dl className="flex w-full flex-col gap-1.5">
				<RateRow
					color={COVERAGE_RING_COLORS.all}
					executed={data.executedCount}
					label="全部生效用例（外环）"
					total={data.activeCount}
				/>
				<RateRow
					color={COVERAGE_RING_COLORS.high}
					executed={data.highPriorityExecutedCount}
					label="P0/P1 生效用例（内环）"
					total={data.highPriorityActiveCount}
				/>
			</dl>
			<p className="self-start text-muted-foreground text-xs">
				阻塞和跳过不算执行
			</p>
		</div>
	);
}

interface OverviewCoverageRateCardProps {
	projectId: string;
}

/** M4 执行覆盖率：两个环的环形进度图。 */
export function OverviewCoverageRateCard({
	projectId,
}: OverviewCoverageRateCardProps) {
	const query = useQuery(
		orpc.projectStats.executionCoverage.queryOptions({ input: { projectId } })
	);

	return (
		<OverviewQuery
			className={NARROW_CARD}
			query={query}
			skeleton={<RingCardSkeleton legendRows={2} />}
			title={COVERAGE_RATE_CARD_TITLE}
		>
			{(data) => (
				<OverviewSection
					className={NARROW_CARD}
					description={`过去 ${EXECUTION_WINDOW_DAYS} 天通过或失败过的生效用例`}
					title={COVERAGE_RATE_CARD_TITLE}
				>
					<CoverageRateContent data={data} projectId={projectId} />
				</OverviewSection>
			)}
		</OverviewQuery>
	);
}

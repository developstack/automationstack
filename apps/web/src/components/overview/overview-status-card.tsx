import { STALE_DRAFT_DAYS } from "@automationstack/db/repositories/project-stats-definitions";
import type { ProjectOverviewStats } from "@automationstack/db/repositories/project-stats-repository";
import type { CaseStatus } from "@automationstack/db/schema/test-cases";
import { useQuery } from "@tanstack/react-query";

import { STATUS_LABELS } from "@/components/cases/case-meta";
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
import { CASE_STATUS_CHART_COLORS } from "@/components/status/status-badge-meta";
import { orpc } from "@/utils/orpc";

export const STATUS_CARD_TITLE = "用例状态";

const STATUS_ORDER: readonly CaseStatus[] = ["active", "draft", "deprecated"];

function staleDraftNote(staleDraftCount: number): string {
	return staleDraftCount === 0
		? `没有超过 ${STALE_DRAFT_DAYS} 天的草稿`
		: `其中 ${formatCount(staleDraftCount)} 条草稿超过 ${STALE_DRAFT_DAYS} 天`;
}

interface StatusContentProps {
	data: ProjectOverviewStats;
	projectId: string;
}

function StatusContent({ data, projectId }: StatusContentProps) {
	const { staleDraftCount, statusCounts, totalCases } = data;
	if (totalCases === 0) {
		return (
			<OverviewEmpty projectId={projectId}>
				这个项目还没有用例。先在用例管理的模块树里新建模块，再在模块里新建用例。
			</OverviewEmpty>
		);
	}
	return (
		<div className={RING_CARD_CONTENT}>
			<OverviewDonut
				centerLabel="条用例"
				centerValue={formatCount(totalCases)}
				slices={STATUS_ORDER.map((status) => ({
					color: CASE_STATUS_CHART_COLORS[status],
					key: status,
					label: STATUS_LABELS[status],
					value: statusCounts[status],
				}))}
			/>
			<p className="sr-only">{`共 ${formatCount(totalCases)} 条用例`}</p>
			<CountLegend
				items={STATUS_ORDER.map((status) => ({
					color: CASE_STATUS_CHART_COLORS[status],
					count: statusCounts[status],
					key: status,
					label: <StatusBadge kind="caseStatus" value={status} />,
				}))}
				total={totalCases}
			/>
			<p className="self-start text-muted-foreground text-xs">
				{staleDraftNote(staleDraftCount)}
			</p>
		</div>
	);
}

interface OverviewStatusCardProps {
	projectId: string;
}

/** M1 用例状态组成：圆环图，中心是用例总数。 */
export function OverviewStatusCard({ projectId }: OverviewStatusCardProps) {
	const query = useQuery(
		orpc.projectStats.overview.queryOptions({ input: { projectId } })
	);

	return (
		<OverviewQuery
			className={NARROW_CARD}
			query={query}
			skeleton={<RingCardSkeleton legendRows={STATUS_ORDER.length} />}
			title={STATUS_CARD_TITLE}
		>
			{(data) => (
				<OverviewSection
					className={NARROW_CARD}
					description="只有生效的用例能放进测试任务"
					title={STATUS_CARD_TITLE}
				>
					<StatusContent data={data} projectId={projectId} />
				</OverviewSection>
			)}
		</OverviewQuery>
	);
}

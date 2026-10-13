import { useQuery } from "@tanstack/react-query";

import { formatDateTime } from "@/components/cases/case-meta";
import { formatCount } from "@/components/overview/overview-metrics";
import { OverviewQuery } from "@/components/overview/overview-query";
import { OverviewSection } from "@/components/overview/overview-section";
import { StaleCardSkeleton } from "@/components/overview/stale-card-skeleton";
import { StaleCaseList } from "@/components/overview/stale-case-list";
import { orpc } from "@/utils/orpc";

export const STALE_CARD_TITLE = "高优先级陈旧用例";

interface OverviewStaleCardProps {
	projectId: string;
}

export function OverviewStaleCard({ projectId }: OverviewStaleCardProps) {
	const query = useQuery(
		orpc.projectStats.staleHighPriority.queryOptions({ input: { projectId } })
	);

	return (
		<OverviewQuery
			query={query}
			skeleton={<StaleCardSkeleton />}
			title={STALE_CARD_TITLE}
		>
			{(data) => (
				<OverviewSection
					action={
						<span className="numeric font-medium text-3xl">
							{formatCount(data.total)}
						</span>
					}
					description={`P0/P1 超过 ${data.thresholdDays} 天没有更新（界限 ${formatDateTime(data.staleBefore)}）`}
					title={STALE_CARD_TITLE}
				>
					<StaleCaseList
						items={data.items}
						projectId={projectId}
						thresholdDays={data.thresholdDays}
						total={data.total}
					/>
				</OverviewSection>
			)}
		</OverviewQuery>
	);
}

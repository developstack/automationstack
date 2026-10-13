import type { CasePriority } from "@automationstack/db/schema/test-cases";
import { useQuery } from "@tanstack/react-query";

import { PRIORITY_VALUES } from "@/components/cases/case-meta";
import { OverviewEmpty } from "@/components/overview/overview-empty";
import { PRIORITY_GRID } from "@/components/overview/overview-layout";
import { formatCount } from "@/components/overview/overview-metrics";
import { OverviewQuery } from "@/components/overview/overview-query";
import { OverviewSection } from "@/components/overview/overview-section";
import { PriorityCardSkeleton } from "@/components/overview/priority-card-skeleton";
import { StatusBadge } from "@/components/status/status-badge";
import { orpc } from "@/utils/orpc";

export const PRIORITY_CARD_TITLE = "优先级分布";

const PERCENT = 100;

function share(count: number, total: number): number {
	return total === 0 ? 0 : Math.round((count / total) * PERCENT);
}

interface PriorityRowProps {
	count: number;
	priority: CasePriority;
	total: number;
}

function PriorityRow({ count, priority, total }: PriorityRowProps) {
	const percent = share(count, total);

	return (
		<>
			<dt>
				<StatusBadge kind="priority" value={priority} />
			</dt>
			<dd aria-hidden="true" className="h-1.5 rounded-full bg-muted">
				<div
					className="h-full rounded-full bg-foreground"
					style={{ width: `${percent}%` }}
				/>
			</dd>
			<dd className="numeric text-right text-muted-foreground text-xs">
				{`${formatCount(count)} 条 · ${percent}%`}
			</dd>
		</>
	);
}

interface OverviewPriorityCardProps {
	projectId: string;
}

export function OverviewPriorityCard({ projectId }: OverviewPriorityCardProps) {
	const query = useQuery(
		orpc.projectStats.overview.queryOptions({ input: { projectId } })
	);

	return (
		<OverviewQuery
			query={query}
			skeleton={<PriorityCardSkeleton />}
			title={PRIORITY_CARD_TITLE}
		>
			{({ priorityCounts, totalCases }) => (
				<OverviewSection
					description="P0/P1 占比过低或过高都需要复核"
					title={PRIORITY_CARD_TITLE}
				>
					{totalCases === 0 ? (
						<OverviewEmpty projectId={projectId}>
							还没有用例。新建用例时选择优先级，这里显示各优先级的占比。
						</OverviewEmpty>
					) : (
						<dl className={PRIORITY_GRID}>
							{PRIORITY_VALUES.map((priority) => (
								<PriorityRow
									count={priorityCounts[priority]}
									key={priority}
									priority={priority}
									total={totalCases}
								/>
							))}
						</dl>
					)}
				</OverviewSection>
			)}
		</OverviewQuery>
	);
}

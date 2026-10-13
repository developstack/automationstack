import type { CasePriority } from "@automationstack/db/schema/test-cases";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@automationstack/ui/components/card";
import { useSuspenseQuery } from "@tanstack/react-query";

import { PRIORITY_VALUES } from "@/components/cases/case-meta";
import { OverviewPriorityBars } from "@/components/overview/overview-priority-bars";
import { StatusBadge } from "@/components/status/status-badge";
import { orpc } from "@/utils/orpc";

const PERCENT = 100;

function share(count: number, total: number): number {
	return total === 0 ? 0 : (count / total) * PERCENT;
}

interface PrioritySliceProps {
	count: number;
	priority: CasePriority;
	total: number;
}

function PriorityLegendItem({ count, priority, total }: PrioritySliceProps) {
	return (
		<li className="flex items-center gap-1.5">
			<StatusBadge kind="priority" value={priority} />
			<span className="text-muted-foreground text-xs tabular-nums">
				{count} 条 · {Math.round(share(count, total))}%
			</span>
		</li>
	);
}

interface OverviewPriorityCardProps {
	projectId: string;
}

export function OverviewPriorityCard({ projectId }: OverviewPriorityCardProps) {
	const { data } = useSuspenseQuery(
		orpc.projectStats.overview.queryOptions({ input: { projectId } })
	);
	const { priorityCounts, totalCases } = data;

	return (
		<Card>
			<CardHeader>
				<CardTitle>优先级分布</CardTitle>
				<CardDescription>P0 / P1 占比过低或过高都值得复核</CardDescription>
			</CardHeader>
			<CardContent>
				{totalCases === 0 ? (
					<p className="text-muted-foreground text-sm">
						查过了：还没有用例，四档优先级都是 0，暂时画不出分布。
					</p>
				) : (
					<>
						<OverviewPriorityBars counts={priorityCounts} total={totalCases} />
						<ul className="flex flex-wrap gap-x-3 gap-y-2">
							{PRIORITY_VALUES.map((priority) => (
								<PriorityLegendItem
									count={priorityCounts[priority]}
									key={priority}
									priority={priority}
									total={totalCases}
								/>
							))}
						</ul>
					</>
				)}
			</CardContent>
		</Card>
	);
}

import type { RecentChangeRow as RecentChange } from "@automationstack/db/repositories/project-stats-activity";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import { formatDateTime } from "@/components/cases/case-meta";
import { ChangesCardSkeleton } from "@/components/overview/changes-card-skeleton";
import { OverviewEmpty } from "@/components/overview/overview-empty";
import {
	CHANGE_ROW_GRID,
	CHANGES_CARD_CLASS,
} from "@/components/overview/overview-layout";
import { OverviewQuery } from "@/components/overview/overview-query";
import { OverviewSection } from "@/components/overview/overview-section";
import { orpc } from "@/utils/orpc";

export const CHANGES_CARD_TITLE = "最近改动";

interface RecentChangeItemProps {
	change: RecentChange;
	projectId: string;
}

function RecentChangeItem({ change, projectId }: RecentChangeItemProps) {
	return (
		<li className={CHANGE_ROW_GRID}>
			<Link
				className="min-w-0 truncate rounded-sm font-medium hover:underline"
				params={{ projectId }}
				search={{ caseId: change.caseId }}
				to="/projects/$projectId"
			>
				{change.caseName}
			</Link>
			<span className="numeric text-muted-foreground text-xs">
				{`v${change.version}`}
			</span>
			<span className="min-w-0 truncate text-muted-foreground text-xs">
				{change.changeNote ?? "—"}
			</span>
			<span className="truncate text-muted-foreground text-xs">
				{change.savedBy ?? "—"}
			</span>
			<span className="numeric text-right text-muted-foreground text-xs">
				{formatDateTime(change.createdAt)}
			</span>
		</li>
	);
}

interface OverviewChangesCardProps {
	projectId: string;
}

export function OverviewChangesCard({ projectId }: OverviewChangesCardProps) {
	const query = useQuery(
		orpc.projectStats.recentChanges.queryOptions({ input: { projectId } })
	);

	return (
		<OverviewQuery
			className={CHANGES_CARD_CLASS}
			query={query}
			skeleton={<ChangesCardSkeleton />}
			title={CHANGES_CARD_TITLE}
		>
			{(data) => (
				<OverviewSection
					className={CHANGES_CARD_CLASS}
					description="每次保存用例都会留下一条版本记录"
					title={CHANGES_CARD_TITLE}
				>
					{data.length === 0 ? (
						<OverviewEmpty projectId={projectId}>
							还没有版本记录。保存一次用例后，这里显示第一条记录。
						</OverviewEmpty>
					) : (
						<ul className="flex flex-col divide-y">
							{data.map((change) => (
								<RecentChangeItem
									change={change}
									key={change.versionId}
									projectId={projectId}
								/>
							))}
						</ul>
					)}
				</OverviewSection>
			)}
		</OverviewQuery>
	);
}

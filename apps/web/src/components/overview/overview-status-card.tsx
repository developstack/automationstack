import { Card, CardContent } from "@automationstack/ui/components/card";
import { useQuery } from "@tanstack/react-query";

import { STATUS_LABELS } from "@/components/cases/case-meta";
import { OverviewEmpty } from "@/components/overview/overview-empty";
import {
	STATUS_CARD_CLASS,
	STATUS_CARD_CONTENT,
	STATUS_COUNT_GRID,
	STATUS_DETAIL_COLUMN,
	STATUS_TOTAL_COLUMN,
} from "@/components/overview/overview-layout";
import { formatCount } from "@/components/overview/overview-metrics";
import { OverviewQuery } from "@/components/overview/overview-query";
import {
	STATUS_ORDER,
	StatusBarcode,
} from "@/components/overview/status-barcode";
import { StatusCardSkeleton } from "@/components/overview/status-card-skeleton";
import { orpc } from "@/utils/orpc";

export const STATUS_CARD_TITLE = "用例状态";

interface StatusCardBodyProps {
	projectId: string;
	statusCounts: Record<(typeof STATUS_ORDER)[number], number>;
	totalCases: number;
}

function StatusCardBody({
	projectId,
	statusCounts,
	totalCases,
}: StatusCardBodyProps) {
	return (
		<Card className={STATUS_CARD_CLASS}>
			<CardContent className={STATUS_CARD_CONTENT}>
				<div className={STATUS_TOTAL_COLUMN}>
					<h2 className="eyebrow">{STATUS_CARD_TITLE}</h2>
					<p className="flex items-baseline gap-1.5">
						<span className="numeric font-medium text-5xl tracking-tight">
							{formatCount(totalCases)}
						</span>
						<span className="text-muted-foreground text-sm">条用例</span>
					</p>
				</div>
				{totalCases === 0 ? (
					<OverviewEmpty projectId={projectId}>
						这个项目还没有用例。先在用例管理的模块树里新建模块，再在模块里新建用例。
					</OverviewEmpty>
				) : (
					<div className={STATUS_DETAIL_COLUMN}>
						<dl className={STATUS_COUNT_GRID}>
							{STATUS_ORDER.map((status) => (
								<div className="flex flex-col gap-1" key={status}>
									<dt className="eyebrow">{STATUS_LABELS[status]}</dt>
									<dd className="numeric text-2xl">
										{formatCount(statusCounts[status])}
									</dd>
								</div>
							))}
						</dl>
						<StatusBarcode counts={statusCounts} />
					</div>
				)}
			</CardContent>
		</Card>
	);
}

interface OverviewStatusCardProps {
	projectId: string;
}

export function OverviewStatusCard({ projectId }: OverviewStatusCardProps) {
	const query = useQuery(
		orpc.projectStats.overview.queryOptions({ input: { projectId } })
	);

	return (
		<OverviewQuery
			className={STATUS_CARD_CLASS}
			query={query}
			skeleton={<StatusCardSkeleton />}
			title={STATUS_CARD_TITLE}
		>
			{(data) => (
				<StatusCardBody
					projectId={projectId}
					statusCounts={data.statusCounts}
					totalCases={data.totalCases}
				/>
			)}
		</OverviewQuery>
	);
}

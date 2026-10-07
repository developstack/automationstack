import type { CasePriority } from "@automationstack/db/schema/test-cases";
import { Badge } from "@automationstack/ui/components/badge";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@automationstack/ui/components/card";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import {
	formatDateTime,
	PRIORITY_BADGE_VARIANTS,
} from "@/components/cases/case-meta";
import { orpc } from "@/utils/orpc";

interface StaleItemProps {
	caseId: string;
	moduleId: string;
	name: string;
	priority: CasePriority;
	projectId: string;
	updatedAt: Date;
}

function StaleCaseRow(props: StaleItemProps) {
	return (
		<li className="flex items-center gap-2 text-sm">
			<Badge variant={PRIORITY_BADGE_VARIANTS[props.priority]}>
				{props.priority}
			</Badge>
			<Link
				className="min-w-0 flex-1 truncate hover:underline"
				params={{ projectId: props.projectId }}
				search={{ caseId: props.caseId, moduleId: props.moduleId }}
				to="/projects/$projectId"
			>
				{props.name}
			</Link>
			<span className="shrink-0 text-muted-foreground text-xs tabular-nums">
				{formatDateTime(props.updatedAt)}
			</span>
		</li>
	);
}

interface OverviewStaleCardProps {
	projectId: string;
}

export function OverviewStaleCard({ projectId }: OverviewStaleCardProps) {
	const { data } = useSuspenseQuery(
		orpc.projectStats.staleHighPriority.queryOptions({ input: { projectId } })
	);
	const hidden = data.total - data.items.length;

	return (
		<Card>
			<CardHeader>
				<CardTitle>高优先级陈旧用例</CardTitle>
				<CardDescription>
					{`P0 / P1 超过 ${data.thresholdDays} 天没更新（界限 ${formatDateTime(data.staleBefore)}）`}
				</CardDescription>
			</CardHeader>
			<CardContent>
				{data.total === 0 ? (
					<p className="text-muted-foreground text-sm">
						{`查过了：没有一条 P0 / P1 超过 ${data.thresholdDays} 天没更新。`}
					</p>
				) : (
					<>
						<p className="font-semibold text-3xl tabular-nums">{data.total}</p>
						<ul className="flex flex-col gap-1.5">
							{data.items.map((item) => (
								<StaleCaseRow
									caseId={item.id}
									key={item.id}
									moduleId={item.moduleId}
									name={item.name}
									priority={item.priority}
									projectId={projectId}
									updatedAt={item.updatedAt}
								/>
							))}
						</ul>
						{hidden > 0 ? (
							<p className="text-muted-foreground text-xs">
								还有 {hidden} 条未列出，去用例列表按 P0 / P1 筛选查看。
							</p>
						) : null}
					</>
				)}
			</CardContent>
		</Card>
	);
}

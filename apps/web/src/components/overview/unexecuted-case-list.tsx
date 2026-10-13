import {
	HIGH_PRIORITIES,
	UNEXECUTED_HIGH_PRIORITY_DAYS,
} from "@automationstack/db/repositories/project-stats-definitions";
import type { ExecutionCoverageStats } from "@automationstack/db/repositories/project-stats-execution";
import { Link } from "@tanstack/react-router";

import { formatCount, formatDay } from "@/components/overview/overview-metrics";
import { StatusBadge } from "@/components/status/status-badge";

type UnexecutedHighPriority = ExecutionCoverageStats["unexecutedHighPriority"];

interface UnexecutedCaseListProps {
	projectId: string;
	unexecuted: UnexecutedHighPriority;
}

/** M4：过去 90 天没有执行的 P0/P1 生效用例。从来没有执行的在最前面。 */
export function UnexecutedCaseList({
	projectId,
	unexecuted,
}: UnexecutedCaseListProps) {
	const { items, total } = unexecuted;
	if (total === 0) {
		return (
			<p className="text-muted-foreground text-sm">
				{`P0/P1 生效用例都在 ${UNEXECUTED_HIGH_PRIORITY_DAYS} 天内执行过。`}
			</p>
		);
	}
	return (
		<div className="flex flex-col gap-2">
			<ul className="flex flex-col gap-1.5">
				{items.map((item) => (
					<li className="flex items-center gap-2 text-sm" key={item.id}>
						<StatusBadge kind="priority" value={item.priority} />
						<Link
							className="min-w-0 flex-1 truncate rounded-sm hover:underline"
							params={{ projectId }}
							search={{ caseId: item.id, moduleId: item.moduleId }}
							to="/projects/$projectId"
						>
							{item.name}
						</Link>
						<span className="numeric shrink-0 text-muted-foreground text-xs">
							{item.lastExecutedAt === null
								? "从未执行"
								: `上次执行 ${formatDay(item.lastExecutedAt)}`}
						</span>
					</li>
				))}
			</ul>
			{total > items.length ? (
				<p className="text-muted-foreground text-xs">
					{`还有 ${formatCount(total - items.length)} 条没有列出。`}
					<Link
						className="rounded-sm text-foreground underline underline-offset-4"
						params={{ projectId }}
						search={{ priority: [...HIGH_PRIORITIES], status: "active" }}
						to="/projects/$projectId"
					>
						查看全部 P0/P1 生效用例
					</Link>
				</p>
			) : null}
		</div>
	);
}

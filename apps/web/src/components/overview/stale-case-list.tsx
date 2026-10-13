import type { StaleCaseRow as StaleCase } from "@automationstack/db/repositories/project-stats-repository";
import type { CasePriority } from "@automationstack/db/schema/test-cases";
import { Link } from "@tanstack/react-router";

import { formatDateTime } from "@/components/cases/case-meta";
import { formatCount } from "@/components/overview/overview-metrics";
import { StatusBadge } from "@/components/status/status-badge";

const HIGH_PRIORITIES: CasePriority[] = ["P0", "P1"];

interface StaleCaseRowProps {
	item: StaleCase;
	projectId: string;
}

function StaleCaseRow({ item, projectId }: StaleCaseRowProps) {
	return (
		<li className="flex items-center gap-2 text-sm">
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
				{formatDateTime(item.updatedAt)}
			</span>
		</li>
	);
}

interface UnlistedStaleNoteProps {
	projectId: string;
	unlistedCount: number;
}

function UnlistedStaleNote({
	projectId,
	unlistedCount,
}: UnlistedStaleNoteProps) {
	return (
		<p className="text-muted-foreground text-xs">
			{`还有 ${formatCount(unlistedCount)} 条没有列出。`}
			<Link
				className="rounded-sm text-foreground underline underline-offset-4"
				params={{ projectId }}
				search={{ priority: HIGH_PRIORITIES }}
				to="/projects/$projectId"
			>
				查看全部 P0/P1 用例
			</Link>
		</p>
	);
}

interface StaleCaseListProps {
	items: readonly StaleCase[];
	projectId: string;
	thresholdDays: number;
	total: number;
}

export function StaleCaseList({
	items,
	projectId,
	thresholdDays,
	total,
}: StaleCaseListProps) {
	if (total === 0) {
		return (
			<p className="text-muted-foreground text-sm">
				{`所有 P0/P1 用例都在 ${thresholdDays} 天内更新过，现在不需要复核。`}
			</p>
		);
	}
	return (
		<>
			<ul className="flex flex-col gap-2">
				{items.map((item) => (
					<StaleCaseRow item={item} key={item.id} projectId={projectId} />
				))}
			</ul>
			{total > items.length ? (
				<UnlistedStaleNote
					projectId={projectId}
					unlistedCount={total - items.length}
				/>
			) : null}
		</>
	);
}

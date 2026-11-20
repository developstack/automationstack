import type {
	FeedCase,
	FeedEntry,
} from "@automationstack/db/repositories/project-stats-activity-core";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@automationstack/ui/components/collapsible";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@automationstack/ui/components/tooltip";
import { Link } from "@tanstack/react-router";
import { ChevronRightIcon } from "lucide-react";

import { formatDateTime } from "@/components/cases/case-meta";
import {
	feedSummary,
	feedVersionLabel,
	formatFeedTime,
	UNKNOWN_ACTOR,
} from "@/components/overview/activity-feed-meta";
import { formatCount } from "@/components/overview/overview-metrics";

interface FeedCaseLineProps {
	action: FeedEntry["action"];
	item: FeedCase;
	projectId: string;
}

/** 一条用例：还存在的用例可以打开；已删除的用例只显示名称。后面是模块、版本和修改说明。 */
function FeedCaseLine({ action, item, projectId }: FeedCaseLineProps) {
	const details = [
		item.moduleName,
		feedVersionLabel(action, item.version),
		item.changeNote,
	].filter((part): part is string => Boolean(part));
	return (
		<li className="flex min-w-0 flex-col">
			{item.exists ? (
				<Link
					className="truncate rounded-sm hover:underline"
					params={{ projectId }}
					search={{ caseId: item.caseId, moduleId: item.moduleId }}
					to="/projects/$projectId"
				>
					{item.caseName}
				</Link>
			) : (
				<span className="truncate text-muted-foreground">{`${item.caseName}（已删除）`}</span>
			)}
			<span className="numeric truncate text-muted-foreground text-xs">
				{details.join(" · ")}
			</span>
		</li>
	);
}

function FeedCaseList({
	entry,
	projectId,
}: {
	entry: FeedEntry;
	projectId: string;
}) {
	const hidden = entry.caseCount - entry.cases.length;
	return (
		<Collapsible>
			<CollapsibleTrigger className="group flex items-center gap-1 rounded-sm text-muted-foreground text-xs hover:text-foreground">
				<ChevronRightIcon className="size-3 transition-transform group-data-panel-open:rotate-90" />
				查看用例
			</CollapsibleTrigger>
			<CollapsibleContent>
				<ul className="flex flex-col gap-1.5 pt-1.5 pl-4 text-sm">
					{entry.cases.map((item) => (
						<FeedCaseLine
							action={entry.action}
							item={item}
							key={item.caseId}
							projectId={projectId}
						/>
					))}
				</ul>
				{hidden > 0 ? (
					<p className="pt-1 pl-4 text-muted-foreground text-xs">
						{`还有 ${formatCount(hidden)} 条没有列出`}
					</p>
				) : null}
			</CollapsibleContent>
		</Collapsible>
	);
}

interface ActivityFeedEntryProps {
	entry: FeedEntry;
	now: Date;
	projectId: string;
}

/** 操作日志的一条：谁、做了什么、什么时候。一次修改或删除多条用例时，用例列表可以展开。 */
export function ActivityFeedEntry({
	entry,
	now,
	projectId,
}: ActivityFeedEntryProps) {
	const [only] = entry.cases;
	const single = entry.caseCount === 1 && only !== undefined;
	return (
		<li className="flex flex-col gap-1 py-2 text-sm">
			<div className="flex items-baseline justify-between gap-2">
				<p className="min-w-0">
					<span className="font-medium">
						{entry.actorName ?? UNKNOWN_ACTOR}
					</span>
					{` ${feedSummary(entry)}`}
				</p>
				<Tooltip>
					<TooltipTrigger
						className="numeric shrink-0 rounded-sm text-muted-foreground text-xs"
						render={<time dateTime={new Date(entry.at).toISOString()} />}
					>
						{formatFeedTime(entry.at, now)}
					</TooltipTrigger>
					<TooltipContent>{formatDateTime(entry.at)}</TooltipContent>
				</Tooltip>
			</div>
			{single ? (
				<ul className="text-xs">
					<FeedCaseLine
						action={entry.action}
						item={only}
						projectId={projectId}
					/>
				</ul>
			) : (
				<FeedCaseList entry={entry} projectId={projectId} />
			)}
		</li>
	);
}

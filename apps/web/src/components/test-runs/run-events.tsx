import { Button } from "@automationstack/ui/components/button";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@automationstack/ui/components/collapsible";
import { useQuery } from "@tanstack/react-query";
import { ChevronDownIcon } from "lucide-react";

import { formatDateTime } from "@/components/cases/case-meta";
import { RUN_STATUS_LABELS } from "@/components/test-runs/test-run-meta";
import { type client, orpc } from "@/utils/orpc";

const SYSTEM_ACTOR = "系统";

type RunEventEntry = Awaited<
	ReturnType<typeof client.testRuns.listEvents>
>[number];

function RunEventList({ entries }: { entries: RunEventEntry[] }) {
	return (
		<ol className="flex flex-col gap-1.5">
			{entries.map(({ actorName, event }) => (
				<li className="flex flex-wrap gap-x-2 text-sm" key={event.id}>
					<span className="text-muted-foreground tabular-nums">
						{formatDateTime(event.createdAt)}
					</span>
					<span>{actorName ?? SYSTEM_ACTOR}</span>
					<span>
						{event.fromStatus === null
							? `创建为「${RUN_STATUS_LABELS[event.toStatus]}」`
							: `${RUN_STATUS_LABELS[event.fromStatus]} → ${RUN_STATUS_LABELS[event.toStatus]}`}
					</span>
					{event.reason !== null && (
						<span className="text-muted-foreground">（{event.reason}）</span>
					)}
				</li>
			))}
		</ol>
	);
}

export function RunEvents({ runId }: { runId: string }) {
	const eventsQuery = useQuery(
		orpc.testRuns.listEvents.queryOptions({ input: { runId } })
	);

	return (
		<Collapsible className="group/run-events border-t">
			<CollapsibleTrigger
				render={
					<Button
						className="w-full justify-start"
						type="button"
						variant="ghost"
					>
						<ChevronDownIcon
							aria-hidden="true"
							className="transition-transform group-data-open/run-events:rotate-180"
							data-icon="inline-start"
						/>
						变更历史
					</Button>
				}
			/>
			<CollapsibleContent className="collapsible-panel">
				<div className="px-4 pb-4">
					{eventsQuery.data?.length === 0 && (
						<p className="text-muted-foreground text-sm">暂无状态变更。</p>
					)}
					{eventsQuery.data ? (
						<RunEventList entries={eventsQuery.data} />
					) : null}
				</div>
			</CollapsibleContent>
		</Collapsible>
	);
}

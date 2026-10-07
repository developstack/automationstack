import {
	Collapsible,
	CollapsibleContent,
} from "@automationstack/ui/components/collapsible";
import { useQuery } from "@tanstack/react-query";

import { formatDateTime } from "@/components/cases/case-meta";
import { RUN_SECTION_TEXT } from "@/components/test-runs/run-panel-typography";
import { RunSectionTrigger } from "@/components/test-runs/run-section-trigger";
import { RESULT_LABELS } from "@/components/test-runs/test-run-meta";
import { type client, orpc } from "@/utils/orpc";

export const DELETED_ACTOR = "已注销的账号";

type RunCaseEventEntry = Awaited<
	ReturnType<typeof client.testRuns.listCaseEvents>
>[number];

function RunCaseEventList({ entries }: { entries: RunCaseEventEntry[] }) {
	return (
		<ol className="flex flex-col gap-1.5">
			{entries.map(({ actorName, event }) => (
				<li
					className={`flex flex-wrap gap-x-2 ${RUN_SECTION_TEXT}`}
					key={event.id}
				>
					<span className="tabular-nums">
						{formatDateTime(event.createdAt)}
					</span>
					<span>{actorName ?? DELETED_ACTOR}</span>
					<span>
						{`${RESULT_LABELS[event.fromResult]} → ${RESULT_LABELS[event.toResult]}`}
					</span>
					{event.comment !== null && <span>（{event.comment}）</span>}
				</li>
			))}
		</ol>
	);
}

export function RunCaseEvents({ runCaseId }: { runCaseId: string }) {
	const eventsQuery = useQuery(
		orpc.testRuns.listCaseEvents.queryOptions({ input: { runCaseId } })
	);

	return (
		<Collapsible className="group/run-section border-t pt-2">
			<RunSectionTrigger label="判定记录" />
			<CollapsibleContent className="collapsible-panel">
				<div className="pb-2">
					{eventsQuery.data?.length === 0 && (
						<p className={RUN_SECTION_TEXT}>这条用例还没有人判过结论。</p>
					)}
					{eventsQuery.data ? (
						<RunCaseEventList entries={eventsQuery.data} />
					) : null}
				</div>
			</CollapsibleContent>
		</Collapsible>
	);
}

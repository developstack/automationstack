/**
 * 底部「变更历史」折叠区。
 *
 * 它是**审计流水**，不是报告的一部分（plan §2.3）：报告页只讲结论与统计，
 * 「谁在什么时候把测试任务从测试中打回了待评审」属于事后追责，两者不该混在一起。
 * 因此默认折叠、放在页面最底部，也不参与任何统计。
 */
import { Button } from "@automationstack/ui/components/button";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@automationstack/ui/components/collapsible";
import { Skeleton } from "@automationstack/ui/components/skeleton";
import { useQuery } from "@tanstack/react-query";
import { ChevronDownIcon } from "lucide-react";

import { formatDateTime } from "@/components/cases/case-meta";
import { RUN_STATUS_LABELS } from "@/components/test-runs/test-run-meta";
import { orpc } from "@/utils/orpc";

/** 系统自动提交的那条事件没有 actor（D16），显示成「系统」而不是空白。 */
const SYSTEM_ACTOR = "系统";

export function RunEvents({ runId }: { runId: string }) {
	const eventsQuery = useQuery(
		orpc.testRuns.listEvents.queryOptions({ input: { runId } })
	);

	return (
		<Collapsible className="border-t">
			<CollapsibleTrigger
				render={
					<Button
						className="w-full justify-start"
						type="button"
						variant="ghost"
					>
						<ChevronDownIcon aria-hidden="true" data-icon="inline-start" />
						变更历史
					</Button>
				}
			/>
			<CollapsibleContent className="px-4 pb-4">
				{eventsQuery.isPending ? <Skeleton className="h-16 w-full" /> : null}
				{eventsQuery.data?.length === 0 && (
					<p className="text-muted-foreground text-sm">暂无状态变更。</p>
				)}
				<ol className="flex flex-col gap-1.5">
					{eventsQuery.data?.map(({ actorName, event }) => (
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
								<span className="text-muted-foreground">
									（{event.reason}）
								</span>
							)}
						</li>
					))}
				</ol>
			</CollapsibleContent>
		</Collapsible>
	);
}

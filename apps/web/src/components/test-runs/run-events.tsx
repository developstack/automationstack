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
import { useQuery } from "@tanstack/react-query";
import { ChevronDownIcon } from "lucide-react";

import { formatDateTime } from "@/components/cases/case-meta";
import { RUN_STATUS_LABELS } from "@/components/test-runs/test-run-meta";
import { type client, orpc } from "@/utils/orpc";

/** 系统自动提交的那条事件没有 actor（D16），显示成「系统」而不是空白。 */
const SYSTEM_ACTOR = "系统";

/** 列表行的形状直接取过程返回值本身（先例：mindmap-tree-input 的 MindmapTreeData）。 */
type RunEventEntry = Awaited<
	ReturnType<typeof client.testRuns.listEvents>
>[number];

/**
 * 时间线列表。从 RunEvents 里拆出来不是因为复用（只在这里用），是因为加上
 * 开合动画之后触发器与内层容器把那个函数撑过了 max-lines-per-function。
 */
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
						{/* 箭头随开合旋转，写法同 ai-proposal-item 的先例：group 挂在
						    Collapsible 根上（data-open 打在那里），箭头用具名 group 变体。 */}
						<ChevronDownIcon
							aria-hidden="true"
							className="transition-transform group-data-open/run-events:rotate-180"
							data-icon="inline-start"
						/>
						变更历史
					</Button>
				}
			/>
			{/* padding 内移到内层容器：height: 0 压不住 padding，留在面板上会在
			    收起过程中露出一条空白带。 */}
			<CollapsibleContent className="collapsible-panel">
				<div className="px-4 pb-4">
					{/*
					 * 加载态不摆骨架。这条查询从页面挂载起就一直挂着（不做「展开才查」，
					 * 理由见组件文档），用户点开这块折叠区时数据早就到了；那条
					 * `h-16 w-full` 的灰条唯一能出现的时机是页面刚开就立刻点开这里，
					 * 而它也预告不了任何形状——事件条数 0..N 都可能，面板又在整页
					 * 最底下向下展开，没有任何东西会被它顶动。
					 */}
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

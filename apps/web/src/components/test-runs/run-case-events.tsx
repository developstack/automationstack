/**
 * 「这条用例是谁判的」——用例级的两层答案。
 *
 * 与页面底部的 `run-events.tsx` 是**两回事**，别看混：那一份记的是整个测试任务
 * 的状态流转（待评审 → 测试中 → 已提交），这一份记的是**单条用例**的结论流转
 * （未测 → 失败 → 未测）。两者的标题刻意用了不同的词（「变更历史」/「判定记录」），
 * 因为它们在同一个页面上同时可见，同名会让人以为点开的是同一份东西。
 *
 * 分两层是因为用户问的是两个粒度不同的问题：
 *
 * 1. 「这条现在算谁的账」——`RunCaseLastVerdict`，一行小字常驻在结论按钮旁边，
 *    不用点开就能看见。它只回答最后一次。
 * 2. 「谁判过通过、又是谁打回的」——`RunCaseEvents`，完整时间线，默认折叠。
 *    单值字段答不了这个问题（每次改判都把上一次覆盖掉），只能问流水表。
 */

import type { TestRunCaseResult } from "@automationstack/db/schema/test-runs";
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
import { RESULT_LABELS } from "@/components/test-runs/test-run-meta";
import { orpc } from "@/utils/orpc";

/**
 * 操作人名字为空时的兜底。
 *
 * 这里**不是**「系统」（`run-events.tsx` 那份才是——测试任务有系统自动提交那条
 * 无主事件）。用例结论只可能由人打出来，`actorName` 为 null 有且只有一种成因：
 * 那个账号被删了（外键 `set null`）。署名丢了，但「有人在那一刻判了这条」这个
 * 事实还在，所以要说出来，不能留白，更不能说成「未知」。
 */
const DELETED_ACTOR = "已注销的账号";

export interface RunCaseLastVerdictProps {
	executedAt: Date | null;
	executedByName: string | null;
	result: TestRunCaseResult;
}

/**
 * 常驻的一行：最后一次是谁、几点、判成了什么。
 *
 * 刻意做成一行小字而不是卡片/边框块：这一页刚刚才把失败专属的三块
 * （说明 / 附件 / 缺陷）收起来过，再加一个有框的区块等于把杂乱又加回去。
 *
 * `untested` 一档整行不显示：后端回退成未测时会把 `executedAt` / `executedBy`
 * 一并清空（见 `buildResultPatch`），此时没有「最后一次判定」这回事——
 * 显示成「未知」是在暗示数据丢了，而实际上是这条用例现在确实没有判定。
 * `executedAt` 为 null 时同样整行不显示，理由相同（不该发生，但不猜）。
 */
export function RunCaseLastVerdict({
	executedAt,
	executedByName,
	result,
}: RunCaseLastVerdictProps) {
	if (result === "untested" || executedAt === null) {
		return null;
	}
	return (
		<p className="text-muted-foreground text-xs">
			{`最后由 ${executedByName ?? DELETED_ACTOR} 于 ${formatDateTime(executedAt)} 判为「${RESULT_LABELS[result]}」`}
		</p>
	);
}

/**
 * 完整时间线，默认折叠。观感与 `run-events.tsx` 一致（同一种列表），
 * 差别只在流转用 `RESULT_LABELS[fromResult] → RESULT_LABELS[toResult]`、
 * 附言用 `event.comment`。
 *
 * 说明文字取的是**流水里的快照**而不是用例上的活值：打回未测会把活值整段清空，
 * 用活值渲染历史会让「他当时为什么判失败」凭空消失。
 *
 * 不做「展开才查」的懒加载：这条查询必须保持挂载，打完结论后
 * `useInvalidateTestRuns()` 刷的是 `orpc.testRuns` 整个缓存根（前缀匹配，
 * 覆盖 `listCaseEvents`），而 TanStack Query 只重取**挂载中**的查询——
 * 挂在折叠状态里，用户点开时看到的才是刚刚那一条。
 */
export function RunCaseEvents({ runCaseId }: { runCaseId: string }) {
	const eventsQuery = useQuery(
		orpc.testRuns.listCaseEvents.queryOptions({ input: { runCaseId } })
	);

	return (
		<Collapsible className="border-t pt-2">
			<CollapsibleTrigger
				render={
					<Button
						className="w-full justify-start"
						type="button"
						variant="ghost"
					>
						<ChevronDownIcon aria-hidden="true" data-icon="inline-start" />
						判定记录
					</Button>
				}
			/>
			<CollapsibleContent className="pb-2">
				{eventsQuery.isPending ? <Skeleton className="h-16 w-full" /> : null}
				{eventsQuery.data?.length === 0 && (
					<p className="text-muted-foreground text-sm">
						这条用例还没有人判过结论。
					</p>
				)}
				<ol className="flex flex-col gap-1.5">
					{eventsQuery.data?.map(({ actorName, event }) => (
						<li className="flex flex-wrap gap-x-2 text-sm" key={event.id}>
							<span className="text-muted-foreground tabular-nums">
								{formatDateTime(event.createdAt)}
							</span>
							<span>{actorName ?? DELETED_ACTOR}</span>
							<span>
								{`${RESULT_LABELS[event.fromResult]} → ${RESULT_LABELS[event.toResult]}`}
							</span>
							{event.comment !== null && (
								<span className="text-muted-foreground">
									（{event.comment}）
								</span>
							)}
						</li>
					))}
				</ol>
			</CollapsibleContent>
		</Collapsible>
	);
}

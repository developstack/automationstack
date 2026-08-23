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
			{/*
			 * 必须能点进那一条：这张卡的动作是「去复核」，只报个名字等于把人丢回
			 * 列表页自己搜。search 同时带 moduleId，落地时左侧模块树也定位到位——
			 * 只给 caseId 的话详情抽屉会开在「全部用例」这个上下文里，关掉抽屉后
			 * 用户不知道这条用例属于哪个模块。
			 */}
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

/**
 * 第 4 张卡：超过阈值天数没更新的 P0/P1。
 *
 * 阈值天数与判定时间界都由后端给（同一个 staleBefore 既用于筛选也用于展示），
 * 前端不再自己算一遍——两处各算一次，跨零点或时区一变就会出现「卡片上写的界限」
 * 与「实际筛出来的那批」对不上。
 *
 * `items` 只有前若干条，`total` 是全量命中数，两者不同时要说清楚，否则用户会以为
 * 全项目就这 10 条陈旧用例。
 */
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
					/*
					 * 空态是好消息，但仍要写出来：这张卡在「没有陈旧用例」和「统计没跑出来」
					 * 两种情况下都是空的，不给一句话用户分不出是哪种。
					 */
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

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

import {
	PRIORITY_BADGE_VARIANTS,
	PRIORITY_VALUES,
} from "@/components/cases/case-meta";
import { OverviewPriorityBars } from "@/components/overview/overview-priority-bars";
import { orpc } from "@/utils/orpc";

const PERCENT = 100;

/** 占比，未取整；total 为 0 时全为 0（此时整张图根本不渲染）。 */
function share(count: number, total: number): number {
	return total === 0 ? 0 : (count / total) * PERCENT;
}

interface PrioritySliceProps {
	count: number;
	priority: CasePriority;
	total: number;
}

function PriorityLegendItem({ count, priority, total }: PrioritySliceProps) {
	return (
		<li className="flex items-center gap-1.5">
			<Badge variant={PRIORITY_BADGE_VARIANTS[priority]}>{priority}</Badge>
			<span className="text-muted-foreground text-xs tabular-nums">
				{count} 条 · {Math.round(share(count, total))}%
			</span>
		</li>
	);
}

interface OverviewPriorityCardProps {
	projectId: string;
}

/**
 * 第 2 张卡：优先级分布条形图 + 徽章图例。
 *
 * 图本身 aria-hidden：它只是图例的一份视觉重述，读屏用户从下面的
 * 「P0 12 条 · 34%」里拿到的是同一份信息，播两遍只会更吵。
 * 图上认人靠 Y 轴直接写着的 P0..P3，不靠颜色——那套灰阶相邻档只差 1.33~1.65:1，
 * 单凭深浅认不出哪根是哪根。
 */
export function OverviewPriorityCard({ projectId }: OverviewPriorityCardProps) {
	const { data } = useSuspenseQuery(
		orpc.projectStats.overview.queryOptions({ input: { projectId } })
	);
	const { priorityCounts, totalCases } = data;

	return (
		<Card>
			<CardHeader>
				<CardTitle>优先级分布</CardTitle>
				<CardDescription>P0 / P1 占比过低或过高都值得复核</CardDescription>
			</CardHeader>
			<CardContent>
				{totalCases === 0 ? (
					<p className="text-muted-foreground text-sm">
						查过了：还没有用例，四档优先级都是 0，暂时画不出分布。
					</p>
				) : (
					<>
						<OverviewPriorityBars counts={priorityCounts} total={totalCases} />
						<ul className="flex flex-wrap gap-x-3 gap-y-2">
							{PRIORITY_VALUES.map((priority) => (
								<PriorityLegendItem
									count={priorityCounts[priority]}
									key={priority}
									priority={priority}
									total={totalCases}
								/>
							))}
						</ul>
					</>
				)}
			</CardContent>
		</Card>
	);
}

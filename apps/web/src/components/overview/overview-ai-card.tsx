import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@automationstack/ui/components/card";
import { useSuspenseQuery } from "@tanstack/react-query";

import { OverviewDonut } from "@/components/overview/overview-donut";
import { orpc } from "@/utils/orpc";

const PERCENT = 100;

/**
 * 采纳的那一段。单系列，用最深的一档，压卡片 15.1:1。
 * 剩下那一段是**轨道**不是系列：它走 --chart-1（压卡片 1.48:1，达不到 3:1），
 * 只负责暗示「整圈有多大」，不进 tooltip、不进图例、也不单独报数——
 * 「N 条提案中 M 条被采纳」那行字已经把两个数都写出来了。
 */
const ACCEPTED_COLOR = "var(--chart-5)";

interface OverviewAiCardProps {
	projectId: string;
}

/**
 * 第 5 张卡：AI 提案采纳率。
 *
 * 百分比在前端算而不是让后端返回，是后端刻意的选择（见 repositories/
 * project-stats-activity.ts）：分母为 0 时百分比无定义，服务端只能编一个 0，
 * 那样就分不清「从没用过 AI」和「一条都没被采纳」。这里把这两种情况分开渲染，
 * 正是那个决定要换来的东西。
 *
 * 分子口径是「提案关联的用例仍然存在」，用例被删会让它退回未采纳。所以这张卡
 * 只展示这一个口径的数，不并排再摆一个按 status 算的采纳数——两套口径挨在一起，
 * 用户只会以为其中一个错了。
 */
export function OverviewAiCard({ projectId }: OverviewAiCardProps) {
	const { data } = useSuspenseQuery(
		orpc.projectStats.aiAdoption.queryOptions({ input: { projectId } })
	);
	const { acceptedCount, proposalCount } = data;
	const hasProposals = proposalCount > 0;
	const rate = hasProposals
		? Math.round((acceptedCount / proposalCount) * PERCENT)
		: 0;

	return (
		<Card>
			<CardHeader>
				<CardTitle>AI 采纳率</CardTitle>
				<CardDescription>AI 生成的提案里最终留下来的比例</CardDescription>
			</CardHeader>
			<CardContent>
				{hasProposals ? (
					<>
						<OverviewDonut
							centerLabel="已采纳"
							centerValue={`${rate}%`}
							showTooltip={false}
							slices={[
								{
									color: ACCEPTED_COLOR,
									key: "accepted",
									label: "已采纳",
									value: acceptedCount,
								},
							]}
							trackValue={proposalCount - acceptedCount}
						/>
						{/* 百分比现在只写在环心的 SVG 里，整块图又是 aria-hidden，这里补一份。 */}
						<p className="sr-only">{`采纳率 ${rate}%`}</p>
						<p className="text-muted-foreground text-sm tabular-nums">
							{proposalCount} 条提案中，{acceptedCount} 条被采纳为用例
						</p>
					</>
				) : (
					/*
					 * 空态不写 0%：分母为 0 时百分比无定义，摆一个 0% 等于告诉用户
					 * 「AI 提了案但一条都没被采纳」，与事实相反。大号位上给破折号，
					 * 理由同 case-collaborators-cell.tsx——留白看着像渲染失败。
					 */
					<>
						<p className="font-semibold text-3xl tabular-nums">—</p>
						<p className="text-muted-foreground text-sm">
							查过了：这个项目还没有用过 AI 生成用例，没有提案就没有采纳率。
						</p>
					</>
				)}
			</CardContent>
		</Card>
	);
}

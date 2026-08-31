/**
 * 项目列表页的加载骨架。原与 ProjectList 同住 project-list.tsx，
 * 按「一个文件一个对外组件」拆开。
 */
import { Skeleton } from "@automationstack/ui/components/skeleton";

import { ProjectCardSkeleton } from "@/components/skeletons/project-card-skeleton";

const SKELETON_CARD_KEYS = ["c1", "c2", "c3"] as const;

/**
 * 路由 pendingComponent：卡片骨架，避免加载期出现空白页。
 * 结构必须与 ProjectList 逐层对齐（外层 flex-col gap-4 + 标题行 + 卡片栅格）：
 * 此前骨架只画了卡片栅格，数据到达时凭空插入 32px 的标题行，整页卡片往下跳一截。
 * 标题行的三个骨架分别对应 h1（text-lg，行高 28px = h-7）、
 * 主题切换按钮（size="icon" = size-8）与默认按钮（h-8）。
 */
export function ProjectListSkeleton() {
	return (
		<output
			aria-busy="true"
			aria-label="项目列表加载中"
			className="flex flex-col gap-4"
		>
			<div className="flex items-center justify-between">
				<Skeleton className="h-7 w-16" />
				<div className="flex items-center gap-2">
					<Skeleton className="size-8" />
					<Skeleton className="h-8 w-24" />
				</div>
			</div>
			<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
				{SKELETON_CARD_KEYS.map((key) => (
					<ProjectCardSkeleton key={key} />
				))}
			</div>
		</output>
	);
}

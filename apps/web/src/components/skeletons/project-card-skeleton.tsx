import { Skeleton } from "@automationstack/ui/components/skeleton";
import { cn } from "@automationstack/ui/lib/utils";

import { PROJECT_CARD_SIZE } from "@/components/projects/project-card-layout";

/** 与 ProjectCard 的尺寸和行高相同：标题一行、描述两行、底部的更新时间和操作按钮。 */
export function ProjectCardSkeleton() {
	return (
		<div
			className={cn(
				"flex flex-col gap-1 rounded-lg border bg-card p-6 shadow-card",
				PROJECT_CARD_SIZE
			)}
		>
			<div className="flex h-6 items-center">
				<Skeleton className="h-4 w-1/2" />
			</div>
			<div className="flex h-10 flex-col justify-around">
				<Skeleton className="h-3.5 w-full" />
				<Skeleton className="h-3.5 w-2/3" />
			</div>
			<div className="flex h-6 items-center justify-between gap-2">
				<Skeleton className="h-4 w-28" />
				<Skeleton className="size-6 rounded-md" />
			</div>
		</div>
	);
}

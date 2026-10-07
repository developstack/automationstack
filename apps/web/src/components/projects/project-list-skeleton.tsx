import { Skeleton } from "@automationstack/ui/components/skeleton";

import { ProjectCardSkeleton } from "@/components/skeletons/project-card-skeleton";

const SKELETON_CARD_KEYS = ["c1", "c2", "c3"] as const;

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

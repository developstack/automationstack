import { Skeleton } from "@automationstack/ui/components/skeleton";
import { cn } from "@automationstack/ui/lib/utils";

export interface ToolbarSkeletonProps {
	endGap: string;
	startWrap: boolean;
}

export function ToolbarSkeleton({ endGap, startWrap }: ToolbarSkeletonProps) {
	return (
		<div
			aria-hidden="true"
			className="flex flex-wrap items-center justify-between gap-2"
		>
			<div className={cn("flex items-center gap-2", startWrap && "flex-wrap")}>
				<Skeleton className="h-8 w-64" />
				<Skeleton className="h-8 w-28" />
			</div>
			<div className={cn("flex items-center", endGap)}>
				<Skeleton className="h-8 w-24" />
				<Skeleton className="h-8 w-28" />
			</div>
		</div>
	);
}

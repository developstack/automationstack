import { Skeleton } from "@automationstack/ui/components/skeleton";

export function ProjectCardSkeleton() {
	return (
		<div className="flex h-28 w-full flex-col rounded-xl border bg-card p-6 shadow-card">
			<Skeleton className="h-5 w-1/2" />
			<Skeleton className="mt-1 h-4 w-3/4" />
			<div className="mt-auto flex h-6 items-center justify-between gap-2">
				<Skeleton className="h-4 w-28" />
				<Skeleton className="size-6 rounded-md" />
			</div>
		</div>
	);
}

import { Skeleton } from "@automationstack/ui/components/skeleton";

export function DonutSkeleton() {
	return (
		<div className="relative mx-auto size-40">
			<Skeleton className="absolute inset-1 rounded-full" />
			<div className="absolute inset-7 flex flex-col items-center justify-center gap-0.5 rounded-full bg-card">
				<Skeleton className="h-9 w-12" />
				<Skeleton className="h-4 w-10" />
			</div>
		</div>
	);
}

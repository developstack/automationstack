import { cn } from "@automationstack/ui/lib/utils";

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			className={cn(
				"rounded-md bg-accent-foreground/10 motion-safe:animate-pulse",
				className
			)}
			data-slot="skeleton"
			{...props}
		/>
	);
}

export { Skeleton };

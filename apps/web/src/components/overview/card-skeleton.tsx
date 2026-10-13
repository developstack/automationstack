import {
	Card,
	CardAction,
	CardContent,
	CardHeader,
} from "@automationstack/ui/components/card";
import { Skeleton } from "@automationstack/ui/components/skeleton";
import { cn } from "@automationstack/ui/lib/utils";
import type { ReactNode } from "react";

interface CardSkeletonProps {
	action?: ReactNode;
	children: ReactNode;
	className?: string;
	descriptionWidth: string;
	titleWidth: string;
}

export function CardSkeleton({
	action,
	children,
	className,
	descriptionWidth,
	titleWidth,
}: CardSkeletonProps) {
	return (
		<Card aria-hidden="true" className={className}>
			<CardHeader>
				<Skeleton className={cn("h-6", titleWidth)} />
				<Skeleton className={cn("h-5", descriptionWidth)} />
				{action === undefined ? null : <CardAction>{action}</CardAction>}
			</CardHeader>
			<CardContent>{children}</CardContent>
		</Card>
	);
}

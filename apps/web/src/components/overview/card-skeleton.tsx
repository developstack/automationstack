import {
	Card,
	CardContent,
	CardHeader,
} from "@automationstack/ui/components/card";
import { Skeleton } from "@automationstack/ui/components/skeleton";
import { cn } from "@automationstack/ui/lib/utils";
import type { ReactNode } from "react";

interface CardSkeletonProps {
	children: ReactNode;
	descriptionWidth: string;
	titleWidth: string;
}

export function CardSkeleton({
	children,
	descriptionWidth,
	titleWidth,
}: CardSkeletonProps) {
	return (
		<Card aria-hidden="true">
			<CardHeader>
				<Skeleton className={cn("h-6", titleWidth)} />
				<Skeleton className={cn("h-5", descriptionWidth)} />
			</CardHeader>
			<CardContent>{children}</CardContent>
		</Card>
	);
}

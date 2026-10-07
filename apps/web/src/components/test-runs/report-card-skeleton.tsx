import {
	Card,
	CardContent,
	CardHeader,
} from "@automationstack/ui/components/card";
import { Skeleton } from "@automationstack/ui/components/skeleton";
import type { ReactNode } from "react";

interface ReportCardSkeletonProps {
	children: ReactNode;
	descriptionWidth: string;
	titleWidth: string;
}

export function ReportCardSkeleton({
	children,
	descriptionWidth,
	titleWidth,
}: ReportCardSkeletonProps) {
	return (
		<Card>
			<CardHeader>
				<Skeleton className={`h-6 ${titleWidth}`} />
				<Skeleton className={`h-5 ${descriptionWidth}`} />
			</CardHeader>
			<CardContent>{children}</CardContent>
		</Card>
	);
}

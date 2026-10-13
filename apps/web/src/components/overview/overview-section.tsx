import {
	Card,
	CardAction,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@automationstack/ui/components/card";
import type { ReactNode } from "react";

interface OverviewSectionProps {
	action?: ReactNode;
	children: ReactNode;
	className?: string;
	description?: ReactNode;
	title: string;
}

/** 项目概览的一个区域：卡片、二级标题、说明和右上角的操作。 */
export function OverviewSection({
	action,
	children,
	className,
	description,
	title,
}: OverviewSectionProps) {
	return (
		<Card className={className}>
			<CardHeader>
				<CardTitle>
					<h2>{title}</h2>
				</CardTitle>
				{description === undefined ? null : (
					<CardDescription>{description}</CardDescription>
				)}
				{action === undefined ? null : <CardAction>{action}</CardAction>}
			</CardHeader>
			<CardContent>{children}</CardContent>
		</Card>
	);
}

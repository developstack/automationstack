import { buttonVariants } from "@automationstack/ui/components/button";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

interface OverviewEmptyProps {
	children: ReactNode;
	projectId: string;
}

/** 区域的空状态：说明现状，并给出去用例管理的下一步。 */
export function OverviewEmpty({ children, projectId }: OverviewEmptyProps) {
	return (
		<div className="flex flex-col items-start gap-3">
			<p className="text-muted-foreground text-sm">{children}</p>
			<Link
				className={buttonVariants({ size: "sm", variant: "outline" })}
				params={{ projectId }}
				to="/projects/$projectId"
			>
				去用例管理
			</Link>
		</div>
	);
}

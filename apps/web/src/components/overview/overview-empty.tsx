import { buttonVariants } from "@automationstack/ui/components/button";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

export type OverviewEmptyTarget = "cases" | "testRuns";

interface OverviewEmptyProps {
	children: ReactNode;
	projectId: string;
	/** 下一步去哪里：用例管理或测试任务列表。 */
	target?: OverviewEmptyTarget;
}

/** 区域的空状态：说明现状，并给出下一步的入口。 */
export function OverviewEmpty({
	children,
	projectId,
	target = "cases",
}: OverviewEmptyProps) {
	const linkClass = buttonVariants({ size: "sm", variant: "outline" });

	return (
		<div className="flex flex-col items-start gap-3">
			<p className="text-muted-foreground text-sm">{children}</p>
			{target === "cases" ? (
				<Link
					className={linkClass}
					params={{ projectId }}
					to="/projects/$projectId"
				>
					去用例管理
				</Link>
			) : (
				<Link
					className={linkClass}
					params={{ projectId }}
					to="/projects/$projectId/test-runs"
				>
					去测试任务
				</Link>
			)}
		</div>
	);
}

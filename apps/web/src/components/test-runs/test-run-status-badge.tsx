import type { TestRunStatus } from "@automationstack/db/schema/test-runs";
import { Badge } from "@automationstack/ui/components/badge";
import { cn } from "@automationstack/ui/lib/utils";
import { LockIcon } from "lucide-react";

import { RUN_STATUS_LABELS } from "@/components/test-runs/test-run-meta";

const STATUS_DOT_CLASSES: Record<
	Exclude<TestRunStatus, "submitted">,
	string
> = {
	completed: "bg-foreground",
	in_progress: "bg-primary",
	pending_review: "border border-muted-foreground",
	ready: "bg-muted-foreground/50",
};

export function TestRunStatusBadge({ status }: { status: TestRunStatus }) {
	if (status === "submitted") {
		return (
			<Badge variant="outline">
				<LockIcon aria-hidden="true" data-icon="inline-start" />
				{RUN_STATUS_LABELS.submitted}
			</Badge>
		);
	}

	return (
		<Badge variant="outline">
			<span
				aria-hidden="true"
				className={cn(
					"size-1.5 shrink-0 rounded-full",
					STATUS_DOT_CLASSES[status]
				)}
			/>
			{RUN_STATUS_LABELS[status]}
		</Badge>
	);
}

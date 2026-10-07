import type { CaseStatus } from "@automationstack/db/schema/test-cases";
import { Badge } from "@automationstack/ui/components/badge";
import { cn } from "@automationstack/ui/lib/utils";

import {
	STATUS_BADGE_VARIANTS,
	STATUS_DOT_CLASSES,
	STATUS_LABELS,
} from "@/components/cases/case-meta";

export function CaseStatusBadge({ status }: { status: CaseStatus }) {
	return (
		<Badge variant={STATUS_BADGE_VARIANTS[status]}>
			<span
				aria-hidden={true}
				className={cn(
					"size-1.5 shrink-0 rounded-full",
					STATUS_DOT_CLASSES[status]
				)}
			/>
			{STATUS_LABELS[status]}
		</Badge>
	);
}

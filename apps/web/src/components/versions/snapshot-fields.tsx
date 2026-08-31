/**
 * The scalar fields (name / priority / status / type / maintainer) of a
 * `CaseSnapshot`, rendered as a definition list. Split out of
 * `version-snapshot-view.tsx` together with the `SnapshotField` row helper.
 */
import type { CaseSnapshot } from "@automationstack/db/schema/test-cases";
import { Badge } from "@automationstack/ui/components/badge";
import type { ReactNode } from "react";

import {
	CASE_TYPE_LABELS,
	PRIORITY_BADGE_VARIANTS,
} from "@/components/cases/case-meta";
import { CaseStatusBadge } from "@/components/cases/case-status-badge";

const EMPTY_VALUE = "—";

interface SnapshotFieldProps {
	children: ReactNode;
	label: string;
}

function SnapshotField({ children, label }: SnapshotFieldProps) {
	return (
		<div className="flex items-start gap-2 py-1">
			<dt className="w-16 shrink-0 text-muted-foreground text-xs">{label}</dt>
			<dd className="min-w-0 flex-1 break-words text-xs">{children}</dd>
		</div>
	);
}

export function SnapshotFields({ snapshot }: { snapshot: CaseSnapshot }) {
	return (
		<dl className="divide-y">
			<SnapshotField label="名称">{snapshot.name}</SnapshotField>
			<SnapshotField label="优先级">
				<Badge variant={PRIORITY_BADGE_VARIANTS[snapshot.priority]}>
					{snapshot.priority}
				</Badge>
			</SnapshotField>
			<SnapshotField label="状态">
				<CaseStatusBadge status={snapshot.status} />
			</SnapshotField>
			<SnapshotField label="类型">
				{CASE_TYPE_LABELS[snapshot.caseType]}
			</SnapshotField>
			<SnapshotField label="维护人">
				{snapshot.maintainer ?? EMPTY_VALUE}
			</SnapshotField>
		</dl>
	);
}

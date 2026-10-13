import type { CaseSnapshot } from "@automationstack/db/schema/test-cases";
import type { ReactNode } from "react";

import { CASE_TYPE_LABELS } from "@/components/cases/case-meta";
import { StatusBadge } from "@/components/status/status-badge";

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
				<StatusBadge kind="priority" value={snapshot.priority} />
			</SnapshotField>
			<SnapshotField label="状态">
				<StatusBadge kind="caseStatus" value={snapshot.status} />
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

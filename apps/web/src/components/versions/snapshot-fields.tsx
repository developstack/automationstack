import type { CaseSnapshot } from "@automationstack/db/schema/test-cases";

import { CASE_TYPE_LABELS } from "@/components/cases/case-meta";
import { StatusBadge } from "@/components/status/status-badge";

import { SnapshotField } from "./snapshot-field.tsx";

const EMPTY_VALUE = <span className="text-muted-foreground">—</span>;

/** 一个版本的字段。字段的名称和顺序与版本对比相同。 */
export function SnapshotFields({ snapshot }: { snapshot: CaseSnapshot }) {
	return (
		<dl className="divide-y rounded-lg border px-3">
			<SnapshotField label="名称">{snapshot.name}</SnapshotField>
			<SnapshotField label="用例状态">
				<StatusBadge kind="caseStatus" value={snapshot.status} />
			</SnapshotField>
			<SnapshotField label="优先级">
				<StatusBadge kind="priority" value={snapshot.priority} />
			</SnapshotField>
			<SnapshotField label="用例类型">
				{CASE_TYPE_LABELS[snapshot.caseType]}
			</SnapshotField>
			<SnapshotField label="维护人">
				{snapshot.maintainer ?? EMPTY_VALUE}
			</SnapshotField>
		</dl>
	);
}

import type { ReactNode } from "react";

import { CASE_TYPE_LABELS, STATUS_LABELS } from "@/components/cases/case-meta";
import { StatusBadge } from "@/components/status/status-badge";

import type {
	CaseScalarsDiff,
	ScalarFieldDiff,
	TagsDiff,
	TextFieldDiff,
} from "./field-diff.ts";
import { OldNewValue } from "./old-new-value.tsx";
import { SnapshotField } from "./snapshot-field.tsx";
import { TagsSection } from "./tags-section.tsx";
import { TextDiff } from "./text-diff.tsx";
import { VersionSection } from "./version-section.tsx";

const EMPTY_VALUE = "—";

interface ScalarRow {
	key: string;
	label: string;
	value: ReactNode;
}

/** 修改的字段显示旧值和新值；没有修改的字段只显示当前值，用例状态和优先级用统一状态标签。 */
function toRow<V>(
	key: string,
	label: string,
	field: ScalarFieldDiff<V>,
	format: { node?: (value: V) => ReactNode; text: (value: V) => string }
): ScalarRow {
	if (field.kind === "changed") {
		return {
			key,
			label,
			value: (
				<OldNewValue
					newText={format.text(field.newValue)}
					oldText={format.text(field.oldValue)}
				/>
			),
		};
	}
	const node = format.node ?? format.text;
	return { key, label, value: node(field.newValue) };
}

function buildScalarRows(scalars: CaseScalarsDiff): ScalarRow[] {
	return [
		toRow("name", "名称", scalars.name, { text: (value) => value }),
		toRow("status", "用例状态", scalars.status, {
			node: (value) => <StatusBadge kind="caseStatus" value={value} />,
			text: (value) => STATUS_LABELS[value],
		}),
		toRow("priority", "优先级", scalars.priority, {
			node: (value) => <StatusBadge kind="priority" value={value} />,
			text: (value) => value,
		}),
		toRow("caseType", "用例类型", scalars.caseType, {
			text: (value) => CASE_TYPE_LABELS[value],
		}),
		toRow("maintainer", "维护人", scalars.maintainer, {
			text: (value) => value ?? EMPTY_VALUE,
		}),
	];
}

function PreconditionsSection({ field }: { field: TextFieldDiff }) {
	return (
		<VersionSection
			aside={
				field.kind === "changed" ? (
					<StatusBadge kind="change" value="modified" />
				) : null
			}
			title="前置条件"
		>
			<TextDiff emptyText="没有前置条件。" segments={field.segments} />
		</VersionSection>
	);
}

interface VersionDiffScalarsProps {
	preconditions: TextFieldDiff;
	scalars: CaseScalarsDiff;
	tags: TagsDiff;
}

export function VersionDiffScalars({
	preconditions,
	scalars,
	tags,
}: VersionDiffScalarsProps) {
	const rows = buildScalarRows(scalars);
	return (
		<div className="flex flex-col gap-6">
			<dl className="divide-y rounded-lg border px-3">
				{rows.map((row) => (
					<SnapshotField key={row.key} label={row.label}>
						{row.value}
					</SnapshotField>
				))}
			</dl>
			<PreconditionsSection field={preconditions} />
			<TagsSection tags={tags} />
		</div>
	);
}

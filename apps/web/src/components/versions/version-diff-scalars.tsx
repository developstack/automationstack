import type { ReactNode } from "react";

import { CASE_TYPE_LABELS } from "@/components/cases/case-meta";
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

const EMPTY_VALUE = <span className="text-muted-foreground">—</span>;

interface ScalarRow {
	key: string;
	label: string;
	value: ReactNode;
}

interface ScalarFormat<V> {
	/** 值是统一状态标签 */
	badge?: boolean;
	render: (value: V) => ReactNode;
}

/** 修改的字段显示旧值和新值；没有修改的字段只显示当前值。 */
function toRow<V>(
	key: string,
	label: string,
	field: ScalarFieldDiff<V>,
	format: ScalarFormat<V>
): ScalarRow {
	if (field.kind === "unchanged") {
		return { key, label, value: format.render(field.newValue) };
	}
	return {
		key,
		label,
		value: (
			<OldNewValue
				badge={format.badge}
				newValue={format.render(field.newValue)}
				oldValue={format.render(field.oldValue)}
			/>
		),
	};
}

function buildScalarRows(scalars: CaseScalarsDiff): ScalarRow[] {
	return [
		toRow("name", "名称", scalars.name, { render: (value) => value }),
		toRow("priority", "优先级", scalars.priority, {
			badge: true,
			render: (value) => <StatusBadge kind="priority" value={value} />,
		}),
		toRow("status", "用例状态", scalars.status, {
			badge: true,
			render: (value) => <StatusBadge kind="caseStatus" value={value} />,
		}),
		toRow("caseType", "用例类型", scalars.caseType, {
			render: (value) => CASE_TYPE_LABELS[value],
		}),
		toRow("maintainer", "维护人", scalars.maintainer, {
			render: (value) => value ?? EMPTY_VALUE,
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

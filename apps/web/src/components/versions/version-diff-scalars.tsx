/**
 * Scalar-field / preconditions / tags portion of the version diff view.
 * Consumes the pure `diffCaseSnapshots` result; no fetching here.
 */
import { Badge } from "@automationstack/ui/components/badge";

import { CASE_TYPE_LABELS, STATUS_LABELS } from "@/components/cases/case-meta";

import type {
	CaseScalarsDiff,
	ScalarFieldDiff,
	TagsDiff,
	TextFieldDiff,
} from "./field-diff.ts";
import { OldNewValue, TextDiff } from "./version-text-diff.tsx";

const EMPTY_VALUE = "—";

interface ScalarRow {
	changed: boolean;
	key: string;
	label: string;
	newText: string;
	oldText: string;
}

function toRow<V>(
	key: string,
	label: string,
	field: ScalarFieldDiff<V>,
	format: (value: V) => string
): ScalarRow {
	return {
		changed: field.kind === "changed",
		key,
		label,
		newText: format(field.newValue),
		oldText: format(field.oldValue),
	};
}

function buildScalarRows(scalars: CaseScalarsDiff): ScalarRow[] {
	return [
		toRow("name", "名称", scalars.name, (value) => value),
		toRow("priority", "优先级", scalars.priority, (value) => value),
		toRow("status", "状态", scalars.status, (value) => STATUS_LABELS[value]),
		toRow(
			"caseType",
			"类型",
			scalars.caseType,
			(value) => CASE_TYPE_LABELS[value]
		),
		toRow(
			"maintainer",
			"维护人",
			scalars.maintainer,
			(value) => value ?? EMPTY_VALUE
		),
	];
}

function ScalarRowItem({ row }: { row: ScalarRow }) {
	return (
		<div className="flex items-start gap-2 py-1">
			<dt className="w-16 shrink-0 text-muted-foreground text-xs">
				{row.label}
			</dt>
			<dd className="min-w-0 flex-1">
				{row.changed ? (
					<OldNewValue newText={row.newText} oldText={row.oldText} />
				) : (
					<span className="break-words text-xs">{row.newText}</span>
				)}
			</dd>
		</div>
	);
}

function TagBadges({
	tags,
	tone,
}: {
	tags: readonly string[];
	tone: "add" | "del";
}) {
	const unique = [...new Set(tags)];
	const className =
		tone === "add"
			? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
			: "border-rose-500/40 bg-rose-500/10 text-rose-700 line-through dark:text-rose-300";
	return (
		<>
			{unique.map((tag) => (
				<Badge className={className} key={`${tone}:${tag}`} variant="outline">
					{tone === "add" ? "+" : "−"} {tag}
				</Badge>
			))}
		</>
	);
}

function TagsSection({ tags }: { tags: TagsDiff }) {
	const hasAny = tags.added.length + tags.removed.length + tags.kept.length > 0;
	return (
		<section className="flex flex-col gap-1.5">
			<h4 className="font-medium text-muted-foreground text-xs">标签</h4>
			{hasAny ? (
				<div className="flex flex-wrap items-center gap-1.5">
					<TagBadges tags={tags.removed} tone="del" />
					<TagBadges tags={tags.added} tone="add" />
					{tags.kept.map((tag) => (
						<Badge key={`kept:${tag}`} variant="secondary">
							{tag}
						</Badge>
					))}
				</div>
			) : (
				<span className="text-muted-foreground text-xs">无标签</span>
			)}
		</section>
	);
}

function PreconditionsSection({ field }: { field: TextFieldDiff }) {
	return (
		<section className="flex flex-col gap-1.5">
			<h4 className="font-medium text-muted-foreground text-xs">
				前置条件
				{field.kind === "changed" ? (
					<span className="ml-1 text-amber-600 dark:text-amber-400">
						已修改
					</span>
				) : null}
			</h4>
			<TextDiff emptyText="无前置条件" segments={field.segments} />
		</section>
	);
}

interface VersionDiffScalarsProps {
	preconditions: TextFieldDiff;
	scalars: CaseScalarsDiff;
	tags: TagsDiff;
}

/** Field-level (non-step) part of a snapshot diff. */
export function VersionDiffScalars({
	preconditions,
	scalars,
	tags,
}: VersionDiffScalarsProps) {
	const rows = buildScalarRows(scalars);
	return (
		<div className="flex flex-col gap-4">
			<dl className="divide-y">
				{rows.map((row) => (
					<ScalarRowItem key={row.key} row={row} />
				))}
			</dl>
			<PreconditionsSection field={preconditions} />
			<TagsSection tags={tags} />
		</div>
	);
}

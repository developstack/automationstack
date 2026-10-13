import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@automationstack/ui/components/table";
import { cn } from "@automationstack/ui/lib/utils";

import { CASE_TABLE_HEAD_CLASS } from "@/components/cases/case-table-layout";
import { StatusBadge } from "@/components/status/status-badge";

import { CHANGE_KIND_LABELS, type ChangeKind } from "./change-kind.ts";
import type { StepDiffEntry, StepsDiff } from "./step-diff.ts";
import { StepTextCell } from "./step-text-cell.tsx";
import { VersionSection } from "./version-section.tsx";

const KIND_ORDER: readonly ChangeKind[] = [
	"added",
	"removed",
	"modified",
	"moved",
	"unchanged",
];

function humanIndex(index: number | null): string {
	return index === null ? "—" : String(index + 1);
}

function orderLabel(entry: StepDiffEntry): string {
	if (entry.kind === "moved") {
		return `${humanIndex(entry.oldIndex)} → ${humanIndex(entry.newIndex)}`;
	}
	if (entry.kind === "removed") {
		return humanIndex(entry.oldIndex);
	}
	return humanIndex(entry.newIndex);
}

function StepDiffRow({ entry }: { entry: StepDiffEntry }) {
	return (
		<TableRow className="last:border-b-0">
			<TableCell className="numeric pl-3 align-top text-muted-foreground text-xs">
				{orderLabel(entry)}
			</TableCell>
			<TableCell className="align-top">
				<StatusBadge kind="change" value={entry.kind} />
			</TableCell>
			<TableCell className="w-1/2 min-w-0 whitespace-normal align-top">
				<StepTextCell entry={entry} field="step" />
			</TableCell>
			<TableCell className="w-1/2 min-w-0 whitespace-normal align-top">
				<StepTextCell entry={entry} field="expected" />
			</TableCell>
		</TableRow>
	);
}

/** 各种变化的步骤数，例如「新增 1 · 修改 2」。 */
function StepCountsSummary({ steps }: { steps: StepsDiff }) {
	const parts = KIND_ORDER.filter((kind) => steps.counts[kind] > 0);
	if (parts.length === 0) {
		return null;
	}
	return (
		<p className="text-muted-foreground text-xs">
			{parts.map((kind, index) => (
				<span key={kind}>
					{index > 0 ? " · " : null}
					{CHANGE_KIND_LABELS[kind]}{" "}
					<span className="numeric">{steps.counts[kind]}</span>
				</span>
			))}
		</p>
	);
}

export function VersionDiffSteps({ steps }: { steps: StepsDiff }) {
	return (
		<VersionSection
			aside={<StepCountsSummary steps={steps} />}
			title="操作步骤"
		>
			{steps.entries.length === 0 ? (
				<p className="rounded-lg border border-dashed px-3 py-4 text-muted-foreground text-sm">
					两个版本都没有步骤。
				</p>
			) : (
				<div className="overflow-hidden rounded-lg border">
					<Table>
						<TableHeader>
							<TableRow className="hover:bg-transparent">
								<TableHead className={cn(CASE_TABLE_HEAD_CLASS, "w-14 pl-3")}>
									#
								</TableHead>
								<TableHead className={cn(CASE_TABLE_HEAD_CLASS, "w-16")}>
									变化
								</TableHead>
								<TableHead className={CASE_TABLE_HEAD_CLASS}>
									操作步骤
								</TableHead>
								<TableHead className={CASE_TABLE_HEAD_CLASS}>
									预期结果
								</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{steps.entries.map((entry) => (
								<StepDiffRow entry={entry} key={entry.id} />
							))}
						</TableBody>
					</Table>
				</div>
			)}
		</VersionSection>
	);
}

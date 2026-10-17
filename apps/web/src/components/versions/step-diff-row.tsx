import { TableCell, TableRow } from "@automationstack/ui/components/table";

import { StatusBadge } from "@/components/status/status-badge";

import type { StepDiffEntry } from "./step-diff.ts";
import { StepTextCell } from "./step-text-cell.tsx";

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

/** 一个步骤的对比：顺序、变化标签、操作步骤和预期结果。 */
export function StepDiffRow({ entry }: { entry: StepDiffEntry }) {
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

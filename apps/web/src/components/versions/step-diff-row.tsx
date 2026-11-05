import type { ColumnScreenshotKey } from "@automationstack/db/schema/test-cases";
import { TableCell, TableRow } from "@automationstack/ui/components/table";

import type { MarkdownImageUrls } from "@/components/cases/markdown-inline-render";
import { StatusBadge } from "@/components/status/status-badge";

import { ScreenshotDiffStrip } from "./screenshot-diff-strip.tsx";
import type { StepDiffEntry, StepDiffField } from "./step-diff.ts";
import { StepTextCell } from "./step-text-cell.tsx";

/** 每一栏的文字和这一栏的截图，见 CONTEXT.md：操作截图和预期截图。 */
const COLUMN_SCREENSHOTS: Record<StepDiffField, ColumnScreenshotKey> = {
	expected: "expectedScreenshots",
	step: "actionScreenshots",
};

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

interface StepDiffColumnProps {
	entry: StepDiffEntry;
	field: StepDiffField;
	imageUrls: MarkdownImageUrls;
}

/** 一栏的对比：文字在上面，这一栏的截图在下面。这一组两个版本都没有截图时只有文字。 */
function StepDiffColumn({ entry, field, imageUrls }: StepDiffColumnProps) {
	const group = COLUMN_SCREENSHOTS[field];
	return (
		<TableCell className="w-1/2 min-w-0 whitespace-normal align-top">
			<div className="flex flex-col gap-2">
				<StepTextCell entry={entry} field={field} />
				<ScreenshotDiffStrip
					entries={entry.screenshots[group]}
					group={group}
					imageUrls={imageUrls}
					position={(entry.newIndex ?? entry.oldIndex ?? 0) + 1}
				/>
			</div>
		</TableCell>
	);
}

interface StepDiffRowProps {
	entry: StepDiffEntry;
	imageUrls: MarkdownImageUrls;
}

/** 一个步骤的对比：顺序、变化标签、操作步骤和预期结果，截图的变化在各自一栏的文字下面。 */
export function StepDiffRow({ entry, imageUrls }: StepDiffRowProps) {
	return (
		<TableRow className="last:border-b-0">
			<TableCell className="numeric pl-3 align-top text-muted-foreground text-xs">
				{orderLabel(entry)}
			</TableCell>
			<TableCell className="align-top">
				<StatusBadge kind="change" value={entry.kind} />
			</TableCell>
			<StepDiffColumn entry={entry} field="step" imageUrls={imageUrls} />
			<StepDiffColumn entry={entry} field="expected" imageUrls={imageUrls} />
		</TableRow>
	);
}

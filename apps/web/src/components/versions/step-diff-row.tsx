import { TableCell, TableRow } from "@automationstack/ui/components/table";
import { cn } from "@automationstack/ui/lib/utils";

import type { MarkdownImageUrls } from "@/components/cases/markdown-inline-render";
import { StatusBadge } from "@/components/status/status-badge";

import type { StepDiffEntry } from "./step-diff.ts";
import { StepScreenshotsDiff } from "./step-screenshots-diff.tsx";
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

function StepTextRow({
	entry,
	joined,
}: {
	entry: StepDiffEntry;
	joined: boolean;
}) {
	return (
		<TableRow className={cn("last:border-b-0", joined && "border-b-0")}>
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

interface StepDiffRowProps {
	entry: StepDiffEntry;
	imageUrls: MarkdownImageUrls;
}

/** 一个步骤的对比。有截图时，截图在文字下面的一行中，与操作和预期结果对齐。 */
export function StepDiffRow({ entry, imageUrls }: StepDiffRowProps) {
	const hasScreenshots = entry.screenshots.length > 0;
	return (
		<>
			<StepTextRow entry={entry} joined={hasScreenshots} />
			{hasScreenshots ? (
				<TableRow className="last:border-b-0 hover:bg-transparent">
					<TableCell colSpan={2} />
					<TableCell className="whitespace-normal pt-0" colSpan={2}>
						<StepScreenshotsDiff
							entries={entry.screenshots}
							imageUrls={imageUrls}
							label={`第 ${humanIndex(entry.newIndex ?? entry.oldIndex)} 步截图`}
						/>
					</TableCell>
				</TableRow>
			) : null}
		</>
	);
}

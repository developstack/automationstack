import { cn } from "@automationstack/ui/lib/utils";

import type { StepDiffEntry, StepDiffKind } from "./step-diff.ts";
import {
	ADDED_TEXT_CLASS,
	REMOVED_TEXT_CLASS,
	TextDiff,
} from "./text-diff.tsx";

const PLAIN_TEXT_CLASS: Partial<Record<StepDiffKind, string>> = {
	added: ADDED_TEXT_CLASS,
	removed: REMOVED_TEXT_CLASS,
};

interface StepTextCellProps {
	entry: StepDiffEntry;
	field: "expected" | "step";
}

export function StepTextCell({ entry, field }: StepTextCellProps) {
	if (entry.kind === "modified") {
		const segments =
			field === "step" ? entry.stepSegments : entry.expectedSegments;
		return <TextDiff segments={segments ?? []} />;
	}
	const source = entry.newStep ?? entry.oldStep;
	const text = source === null ? "" : source[field];
	if (text.length === 0) {
		return <span className="text-muted-foreground text-xs">（空）</span>;
	}
	const toneClass = PLAIN_TEXT_CLASS[entry.kind];
	return (
		<p
			className={cn(
				"whitespace-pre-wrap break-words text-xs leading-relaxed",
				toneClass
			)}
		>
			{text}
		</p>
	);
}

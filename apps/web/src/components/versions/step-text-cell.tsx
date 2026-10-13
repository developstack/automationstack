import { DiffMark } from "./diff-mark.tsx";
import type { StepDiffEntry } from "./step-diff.ts";
import { TextDiff } from "./text-diff.tsx";

const TEXT_CLASS = "whitespace-pre-wrap break-words text-sm leading-relaxed";

interface StepTextCellProps {
	entry: StepDiffEntry;
	field: "expected" | "step";
}

/** 步骤对比表格的一格：修改的步骤逐词对比，新增和删除的步骤整段标记。 */
export function StepTextCell({ entry, field }: StepTextCellProps) {
	if (entry.kind === "modified") {
		const segments =
			field === "step" ? entry.stepSegments : entry.expectedSegments;
		return <TextDiff segments={segments ?? []} />;
	}
	const source = entry.newStep ?? entry.oldStep;
	const text = source === null ? "" : source[field];
	if (text.length === 0) {
		return <span className="text-muted-foreground text-sm">（空）</span>;
	}
	if (entry.kind === "added" || entry.kind === "removed") {
		return (
			<p className={TEXT_CLASS}>
				<DiffMark kind={entry.kind}>{text}</DiffMark>
			</p>
		);
	}
	return <p className={TEXT_CLASS}>{text}</p>;
}

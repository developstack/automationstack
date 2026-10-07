import { diffWords } from "diff";

export type TextDiffSegmentKind = "added" | "removed" | "unchanged";

export interface TextDiffSegment {
	kind: TextDiffSegmentKind;
	text: string;
}

function segmentKind(added: boolean, removed: boolean): TextDiffSegmentKind {
	if (added) {
		return "added";
	}
	if (removed) {
		return "removed";
	}
	return "unchanged";
}

export function buildWordDiffSegments(
	oldText: string,
	newText: string
): TextDiffSegment[] {
	return diffWords(oldText, newText).map((change) => ({
		kind: segmentKind(change.added, change.removed),
		text: change.value,
	}));
}

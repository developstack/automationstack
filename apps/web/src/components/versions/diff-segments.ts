/**
 * Word-level text diff segments shared by the version diff helpers.
 * Wraps jsdiff's `diffWords` into a renderer-friendly shape so UI code
 * can map segments straight to <ins>/<del>/plain spans.
 */
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

/** Runs jsdiff `diffWords` and maps each change into a typed segment. */
export function buildWordDiffSegments(
	oldText: string,
	newText: string
): TextDiffSegment[] {
	return diffWords(oldText, newText).map((change) => ({
		kind: segmentKind(change.added, change.removed),
		text: change.value,
	}));
}

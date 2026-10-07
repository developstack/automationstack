import type {
	CasePriority,
	CaseSnapshot,
	CaseStatus,
	CaseType,
} from "@automationstack/db/schema/test-cases";
import {
	buildWordDiffSegments,
	type TextDiffSegment,
} from "./diff-segments.ts";
import { diffCaseSteps, type StepsDiff } from "./step-diff.ts";

export type FieldChangeKind = "changed" | "unchanged";

export interface ScalarFieldDiff<V> {
	kind: FieldChangeKind;
	newValue: V;
	oldValue: V;
}

export interface TextFieldDiff {
	kind: FieldChangeKind;
	newValue: string | null;
	oldValue: string | null;
	segments: TextDiffSegment[];
}

export interface TagsDiff {
	added: string[];
	kept: string[];
	kind: FieldChangeKind;
	removed: string[];
}

export interface CaseScalarsDiff {
	caseType: ScalarFieldDiff<CaseType>;
	maintainer: ScalarFieldDiff<string | null>;
	name: ScalarFieldDiff<string>;
	priority: ScalarFieldDiff<CasePriority>;
	status: ScalarFieldDiff<CaseStatus>;
}

export interface CaseSnapshotDiff {
	hasChanges: boolean;
	preconditions: TextFieldDiff;
	scalars: CaseScalarsDiff;
	steps: StepsDiff;
	tags: TagsDiff;
}

function diffScalar<V>(oldValue: V, newValue: V): ScalarFieldDiff<V> {
	return {
		kind: oldValue === newValue ? "unchanged" : "changed",
		newValue,
		oldValue,
	};
}

function diffText(
	oldValue: string | null,
	newValue: string | null
): TextFieldDiff {
	return {
		kind: (oldValue ?? "") === (newValue ?? "") ? "unchanged" : "changed",
		newValue,
		oldValue,
		segments: buildWordDiffSegments(oldValue ?? "", newValue ?? ""),
	};
}

function diffTags(
	oldTags: readonly string[],
	newTags: readonly string[]
): TagsDiff {
	const oldSet = new Set(oldTags);
	const newSet = new Set(newTags);
	const added = newTags.filter((tag) => !oldSet.has(tag));
	const removed = oldTags.filter((tag) => !newSet.has(tag));
	return {
		added,
		kept: newTags.filter((tag) => oldSet.has(tag)),
		kind: added.length === 0 && removed.length === 0 ? "unchanged" : "changed",
		removed,
	};
}

function diffScalars(
	oldSnapshot: CaseSnapshot,
	newSnapshot: CaseSnapshot
): CaseScalarsDiff {
	return {
		caseType: diffScalar(oldSnapshot.caseType, newSnapshot.caseType),
		maintainer: diffScalar(oldSnapshot.maintainer, newSnapshot.maintainer),
		name: diffScalar(oldSnapshot.name, newSnapshot.name),
		priority: diffScalar(oldSnapshot.priority, newSnapshot.priority),
		status: diffScalar(oldSnapshot.status, newSnapshot.status),
	};
}

function hasScalarChanges(scalars: CaseScalarsDiff): boolean {
	return Object.values(scalars).some((field) => field.kind === "changed");
}

export function diffCaseSnapshots(
	oldSnapshot: CaseSnapshot,
	newSnapshot: CaseSnapshot
): CaseSnapshotDiff {
	const preconditions = diffText(
		oldSnapshot.preconditions,
		newSnapshot.preconditions
	);
	const scalars = diffScalars(oldSnapshot, newSnapshot);
	const steps = diffCaseSteps(oldSnapshot.steps, newSnapshot.steps);
	const tags = diffTags(oldSnapshot.tags, newSnapshot.tags);
	return {
		hasChanges:
			hasScalarChanges(scalars) ||
			preconditions.kind === "changed" ||
			tags.kind === "changed" ||
			steps.hasChanges,
		preconditions,
		scalars,
		steps,
		tags,
	};
}

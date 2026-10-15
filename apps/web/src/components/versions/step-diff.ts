import type { CaseStep } from "@automationstack/db/schema/test-cases";

import { stepScreenshots } from "@/components/cases/step-screenshots";

import type { ChangeKind } from "./change-kind.ts";
import {
	buildWordDiffSegments,
	type TextDiffSegment,
} from "./diff-segments.ts";
import {
	diffScreenshots,
	hasScreenshotChanges,
	type ScreenshotDiffEntry,
} from "./screenshot-diff.ts";

export interface StepDiffEntry {
	expectedSegments: TextDiffSegment[] | null;
	id: string;
	kind: ChangeKind;
	newIndex: number | null;
	newStep: CaseStep | null;
	oldIndex: number | null;
	oldStep: CaseStep | null;
	/** 这个步骤的截图变化。新增的步骤中所有截图都是新增，删除的步骤中所有截图都是删除。 */
	screenshots: ScreenshotDiffEntry[];
	stepSegments: TextDiffSegment[] | null;
}

export type StepsDiffCounts = Record<ChangeKind, number>;

export interface StepsDiff {
	counts: StepsDiffCounts;
	entries: StepDiffEntry[];
	hasChanges: boolean;
}

interface PairedSteps {
	newIndex: number;
	newStep: CaseStep;
	oldIndex: number;
	oldStep: CaseStep;
}

function createAddedEntry(newStep: CaseStep, newIndex: number): StepDiffEntry {
	return {
		expectedSegments: null,
		id: newStep.id,
		kind: "added",
		newIndex,
		newStep,
		oldIndex: null,
		oldStep: null,
		screenshots: diffScreenshots([], stepScreenshots(newStep)),
		stepSegments: null,
	};
}

function createRemovedEntry(
	oldStep: CaseStep,
	oldIndex: number
): StepDiffEntry {
	return {
		expectedSegments: null,
		id: oldStep.id,
		kind: "removed",
		newIndex: null,
		newStep: null,
		oldIndex,
		oldStep,
		screenshots: diffScreenshots(stepScreenshots(oldStep), []),
		stepSegments: null,
	};
}

function createPairedEntry(pair: PairedSteps): StepDiffEntry {
	const { newIndex, newStep, oldIndex, oldStep } = pair;
	const screenshots = diffScreenshots(
		stepScreenshots(oldStep),
		stepScreenshots(newStep)
	);
	const contentChanged =
		oldStep.step !== newStep.step ||
		oldStep.expected !== newStep.expected ||
		hasScreenshotChanges(screenshots);
	const base = {
		expectedSegments: null,
		id: newStep.id,
		newIndex,
		newStep,
		oldIndex,
		oldStep,
		screenshots,
		stepSegments: null,
	};
	if (contentChanged) {
		return {
			...base,
			expectedSegments: buildWordDiffSegments(
				oldStep.expected,
				newStep.expected
			),
			kind: "modified",
			stepSegments: buildWordDiffSegments(oldStep.step, newStep.step),
		};
	}
	return { ...base, kind: oldIndex === newIndex ? "unchanged" : "moved" };
}

function countEntries(entries: readonly StepDiffEntry[]): StepsDiffCounts {
	const counts: StepsDiffCounts = {
		added: 0,
		modified: 0,
		moved: 0,
		removed: 0,
		unchanged: 0,
	};
	for (const entry of entries) {
		counts[entry.kind] += 1;
	}
	return counts;
}

export function diffCaseSteps(
	oldSteps: readonly CaseStep[],
	newSteps: readonly CaseStep[]
): StepsDiff {
	const oldIndexById = new Map<string, number>();
	for (const [index, step] of oldSteps.entries()) {
		oldIndexById.set(step.id, index);
	}
	const newIds = new Set(newSteps.map((step) => step.id));

	const entries: StepDiffEntry[] = [];
	for (const [newIndex, newStep] of newSteps.entries()) {
		const oldIndex = oldIndexById.get(newStep.id);
		if (oldIndex === undefined) {
			entries.push(createAddedEntry(newStep, newIndex));
		} else {
			const oldStep = oldSteps[oldIndex];
			entries.push(createPairedEntry({ newIndex, newStep, oldIndex, oldStep }));
		}
	}
	for (const [oldIndex, oldStep] of oldSteps.entries()) {
		if (!newIds.has(oldStep.id)) {
			entries.push(createRemovedEntry(oldStep, oldIndex));
		}
	}

	const counts = countEntries(entries);
	return {
		counts,
		entries,
		hasChanges: entries.length > counts.unchanged,
	};
}

import type {
	AutomationTargetRow,
	SubmittedRunBlocker,
} from "@automationstack/db/repositories/automation-ingest-repository";

import type {
	IngestOutOfScopeEntry,
	IngestSkippedManualEntry,
	IngestWrittenToEntry,
} from "./execution-contract";
import {
	describeSubmittedBlocker,
	REASON_NO_CANDIDATE_RUN,
	REASON_SKIPPED_MANUAL,
} from "./execution-reason-text";
import type {
	AutomationWriteGroup,
	UnexplainedSourceRef,
} from "./execution-write-plan";

export function buildUnexplainedOutOfScopeEntries(
	unexplained: UnexplainedSourceRef[],
	blockers: SubmittedRunBlocker[]
): IngestOutOfScopeEntry[] {
	const blockerBySourceRef = new Map(
		blockers.map((blocker) => [blocker.sourceRef, blocker] as const)
	);
	return unexplained.map((entry) => {
		const blocker = blockerBySourceRef.get(entry.sourceRef);
		if (blocker === undefined) {
			return {
				caseId: entry.caseId,
				reason: REASON_NO_CANDIDATE_RUN,
				runName: null,
				sourceRef: entry.sourceRef,
			};
		}
		return {
			caseId: entry.caseId,
			reason: describeSubmittedBlocker(blocker),
			runName: blocker.runName,
			sourceRef: entry.sourceRef,
		};
	});
}

export function buildSkippedManualEntries(
	group: AutomationWriteGroup,
	skippedRunCaseIds: string[]
): IngestSkippedManualEntry[] {
	if (skippedRunCaseIds.length === 0) {
		return [];
	}
	const sourceRefByRunCaseId = new Map(
		group.items.map((item) => [item.runCaseId, item.sourceRef] as const)
	);
	const entries: IngestSkippedManualEntry[] = [];
	for (const runCaseId of skippedRunCaseIds) {
		const sourceRef = sourceRefByRunCaseId.get(runCaseId);
		if (sourceRef === undefined) {
			continue;
		}
		entries.push({
			reason: REASON_SKIPPED_MANUAL,
			runName: group.runName,
			sourceRef,
		});
	}
	return entries;
}

export function buildGroupOutOfScopeEntries(
	group: AutomationWriteGroup,
	caseIdBySourceRef: Map<string, string>,
	reason: string
): IngestOutOfScopeEntry[] {
	const entries: IngestOutOfScopeEntry[] = [];
	for (const item of group.items) {
		const caseId = caseIdBySourceRef.get(item.sourceRef);
		if (caseId === undefined) {
			continue;
		}
		entries.push({
			caseId,
			reason,
			runName: group.runName,
			sourceRef: item.sourceRef,
		});
	}
	return entries;
}

export function buildCaseIdBySourceRef(
	rows: AutomationTargetRow[]
): Map<string, string> {
	return new Map(rows.map((row) => [row.sourceRef, row.caseId] as const));
}

export function buildWrittenToEntry(
	group: AutomationWriteGroup,
	updatedCount: number
): IngestWrittenToEntry | null {
	if (updatedCount === 0) {
		return null;
	}
	return { runId: group.runId, runName: group.runName, updated: updatedCount };
}

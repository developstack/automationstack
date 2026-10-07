import type { AutomationTargetRow } from "@automationstack/db/repositories/automation-ingest-repository";

import type {
	IngestExecutionResult,
	IngestOutOfScopeEntry,
	IngestUnmatchedCaseEntry,
} from "./execution-contract";
import {
	describePendingReview,
	describeRunIdsExcluded,
	REASON_UNMATCHED,
} from "./execution-reason-text";
import {
	type AutomationWriteGroup,
	bucketCandidateRows,
	pushResultItems,
	type UnexplainedSourceRef,
} from "./execution-write-plan";

export interface ReconciledAutomationTargets {
	groups: AutomationWriteGroup[];
	outOfScope: IngestOutOfScopeEntry[];
	unexplained: UnexplainedSourceRef[];
	unmatchedCases: IngestUnmatchedCaseEntry[];
}

export interface ReconcileAutomationTargetsInput {
	results: IngestExecutionResult[];
	rows: AutomationTargetRow[];
	runIds: string[] | null;
}

function groupRowsBySourceRef(
	rows: AutomationTargetRow[]
): Map<string, AutomationTargetRow[]> {
	const bySourceRef = new Map<string, AutomationTargetRow[]>();
	for (const row of rows) {
		const bucket = bySourceRef.get(row.sourceRef);
		if (bucket) {
			bucket.push(row);
			continue;
		}
		bySourceRef.set(row.sourceRef, [row]);
	}
	return bySourceRef;
}

function buildRunBlockedEntries(
	caseId: string,
	sourceRef: string,
	runNames: string[],
	describe: (runName: string) => string
): IngestOutOfScopeEntry[] {
	return runNames.map((runName) => ({
		caseId,
		reason: describe(runName),
		runName,
		sourceRef,
	}));
}

interface ReconcileAccumulator {
	groupByRunId: Map<string, AutomationWriteGroup>;
	outOfScope: IngestOutOfScopeEntry[];
	unexplained: UnexplainedSourceRef[];
	unmatchedCases: IngestUnmatchedCaseEntry[];
}

function reconcileOneResult(
	acc: ReconcileAccumulator,
	result: IngestExecutionResult,
	rows: AutomationTargetRow[],
	allowedRunIds: Set<string> | null
): void {
	const [firstRow] = rows;
	if (!firstRow) {
		acc.unmatchedCases.push({
			reason: REASON_UNMATCHED,
			sourceRef: result.sourceRef,
		});
		return;
	}
	const { caseId } = firstRow;
	const buckets = bucketCandidateRows(rows, allowedRunIds);
	acc.outOfScope.push(
		...buildRunBlockedEntries(
			caseId,
			result.sourceRef,
			buckets.pendingReviewRunNames,
			describePendingReview
		)
	);
	if (buckets.targets.length > 0) {
		pushResultItems(acc.groupByRunId, result, buckets.targets);
		return;
	}
	const excluded = buildRunBlockedEntries(
		caseId,
		result.sourceRef,
		buckets.excludedRunNames,
		describeRunIdsExcluded
	);
	acc.outOfScope.push(...excluded);
	if (excluded.length === 0 && buckets.pendingReviewRunNames.length === 0) {
		acc.unexplained.push({ caseId, sourceRef: result.sourceRef });
	}
}

export function reconcileAutomationTargets(
	input: ReconcileAutomationTargetsInput
): ReconciledAutomationTargets {
	const rowsBySourceRef = groupRowsBySourceRef(input.rows);
	const allowedRunIds =
		input.runIds === null ? null : new Set<string>(input.runIds);
	const acc: ReconcileAccumulator = {
		groupByRunId: new Map(),
		outOfScope: [],
		unexplained: [],
		unmatchedCases: [],
	};
	for (const result of input.results) {
		const rows = rowsBySourceRef.get(result.sourceRef) ?? [];
		reconcileOneResult(acc, result, rows, allowedRunIds);
	}
	return {
		groups: [...acc.groupByRunId.values()],
		outOfScope: acc.outOfScope,
		unexplained: acc.unexplained,
		unmatchedCases: acc.unmatchedCases,
	};
}

// biome-ignore lint/performance/noBarrelFile: 不是 barrel，是搬走定义后保住的导出面，见上
export { describeRunWriteRejection } from "./execution-reason-text";
export {
	buildCaseIdBySourceRef,
	buildGroupOutOfScopeEntries,
	buildSkippedManualEntries,
	buildUnexplainedOutOfScopeEntries,
	buildWrittenToEntry,
} from "./execution-receipt-entries";
export {
	findDuplicateSourceRefs,
	normalizeIngestComment,
} from "./execution-results-normalize";
export type {
	AutomationWriteGroup,
	AutomationWriteItem,
	UnexplainedSourceRef,
} from "./execution-write-plan";

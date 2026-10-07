import type { AutomationTargetRow } from "@automationstack/db/repositories/automation-ingest-repository";

import type {
	AutomationCaseResult,
	IngestExecutionResult,
} from "./execution-contract";
import { normalizeIngestComment } from "./execution-results-normalize";

export interface AutomationWriteItem {
	comment: string | null;
	result: AutomationCaseResult;
	runCaseId: string;
	sourceRef: string;
}

export interface AutomationWriteGroup {
	items: AutomationWriteItem[];
	runId: string;
	runName: string;
}

export interface WritableTarget {
	runCaseId: string;
	runId: string;
	runName: string;
}

export interface CandidateBuckets {
	excludedRunNames: string[];
	pendingReviewRunNames: string[];
	targets: WritableTarget[];
}

export interface UnexplainedSourceRef {
	caseId: string;
	sourceRef: string;
}

function isPendingReview(row: AutomationTargetRow): boolean {
	return row.runStatus === "pending_review";
}

export function bucketCandidateRows(
	rows: AutomationTargetRow[],
	allowedRunIds: Set<string> | null
): CandidateBuckets {
	const buckets: CandidateBuckets = {
		excludedRunNames: [],
		pendingReviewRunNames: [],
		targets: [],
	};
	for (const row of rows) {
		if (row.runCaseId === null || row.runId === null || row.runName === null) {
			continue;
		}
		if (allowedRunIds !== null && !allowedRunIds.has(row.runId)) {
			buckets.excludedRunNames.push(row.runName);
			continue;
		}
		if (isPendingReview(row)) {
			buckets.pendingReviewRunNames.push(row.runName);
			continue;
		}
		buckets.targets.push({
			runCaseId: row.runCaseId,
			runId: row.runId,
			runName: row.runName,
		});
	}
	return buckets;
}

function pushWriteItem(
	groupByRunId: Map<string, AutomationWriteGroup>,
	target: WritableTarget,
	item: AutomationWriteItem
): void {
	const group = groupByRunId.get(target.runId);
	if (group) {
		group.items.push(item);
		return;
	}
	groupByRunId.set(target.runId, {
		items: [item],
		runId: target.runId,
		runName: target.runName,
	});
}

export function pushResultItems(
	groupByRunId: Map<string, AutomationWriteGroup>,
	result: IngestExecutionResult,
	targets: WritableTarget[]
): void {
	const comment = normalizeIngestComment(result.message);
	for (const target of targets) {
		pushWriteItem(groupByRunId, target, {
			comment,
			result: result.result,
			runCaseId: target.runCaseId,
			sourceRef: result.sourceRef,
		});
	}
}

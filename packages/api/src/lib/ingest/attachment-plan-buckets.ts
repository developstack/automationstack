import type { AutomationTargetRow } from "@automationstack/db/repositories/automation-ingest-repository";

import type { IngestAttachmentRejection } from "./attachment-contract";

function isPendingReview(row: AutomationTargetRow): boolean {
	return row.runStatus === "pending_review";
}

export function describePendingReview(runName: string): string {
	return `测试任务「${runName}」还在待评审，不接受附件`;
}

export function describeRunIdsExcluded(runName: string): string {
	return `测试任务「${runName}」是这条用例的候选（未提交），但本轮的 runIds 白名单没有带上它，附件未获签名`;
}

export function groupRowsBySourceRef(
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

export function buildBlockedRejections(
	index: number,
	sourceRef: string,
	runNames: string[],
	describe: (runName: string) => string
): IngestAttachmentRejection[] {
	return runNames.map((runName) => ({
		index,
		reason: describe(runName),
		runName,
		sourceRef,
	}));
}

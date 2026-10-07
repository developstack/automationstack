import type { AutomationTargetRow } from "@automationstack/db/repositories/automation-ingest-repository";

import { validateAttachmentUpload } from "../attachment-policy";
import type {
	IngestAttachmentPresignItem,
	IngestAttachmentRejection,
} from "./attachment-contract";
import {
	bucketCandidateRows,
	buildBlockedRejections,
	type CandidateBuckets,
	describePendingReview,
	describeRunIdsExcluded,
	groupRowsBySourceRef,
} from "./attachment-plan-buckets";
import {
	type AttachmentUploadGroup,
	applyRunQuota,
	pushUploadItem,
} from "./attachment-plan-quota";

export type {
	AttachmentUploadGroup,
	AttachmentUploadItem,
} from "./attachment-plan-quota";
// biome-ignore lint/performance/noBarrelFile: 兼容拆分前的导入路径，理由见上
export { buildGroupRejections } from "./attachment-plan-quota";
export type {
	AttachmentRegisterGroup,
	AttachmentRegisterItem,
} from "./attachment-register-plan";
export {
	buildRegisterRejections,
	groupRegisterItemsByRunId,
} from "./attachment-register-plan";
export {
	describeRunCaseVanished,
	describeRunUnwritable,
	REASON_STORAGE_UNCONFIGURED,
} from "./attachment-reject-text";
export type {
	VerifyAutomationAttachmentInput,
	VerifyAutomationAttachmentResult,
} from "./attachment-verify";
export { verifyAutomationAttachment } from "./attachment-verify";

const REASON_UNMATCHED = "项目里没有这个 sourceRef 的用例";
const REASON_NO_CANDIDATE_RUN = "不在任何未提交任务的范围内";

export interface PlannedAttachmentUploads {
	groups: AttachmentUploadGroup[];
	rejected: IngestAttachmentRejection[];
}

export interface PlanAttachmentUploadsInput {
	attachments: IngestAttachmentPresignItem[];
	rows: AutomationTargetRow[];
	runIds: string[] | null;
}

function rejectByPolicy(
	item: IngestAttachmentPresignItem,
	index: number
): IngestAttachmentRejection | null {
	const validation = validateAttachmentUpload(item);
	if (validation.kind === "ok") {
		return null;
	}
	if (validation.kind === "too-large") {
		return {
			index,
			reason: `附件 ${item.sizeBytes} 字节，超过单文件上限 ${validation.maxBytes} 字节`,
			runName: null,
			sourceRef: item.sourceRef,
		};
	}
	return {
		index,
		reason: `${item.kind} 不支持 ${item.contentType}，允许的类型：${validation.allowedContentTypes.join(", ")}`,
		runName: null,
		sourceRef: item.sourceRef,
	};
}

function explainNoTarget(
	index: number,
	sourceRef: string,
	buckets: CandidateBuckets
): IngestAttachmentRejection[] {
	const excluded = buildBlockedRejections(
		index,
		sourceRef,
		buckets.excludedRunNames,
		describeRunIdsExcluded
	);
	if (excluded.length > 0 || buckets.pendingReviewRunNames.length > 0) {
		return excluded;
	}
	return [{ index, reason: REASON_NO_CANDIDATE_RUN, runName: null, sourceRef }];
}

interface AttachmentPlanState {
	groupByRunId: Map<string, AttachmentUploadGroup>;
	rejected: IngestAttachmentRejection[];
	rowsBySourceRef: Map<string, AutomationTargetRow[]>;
}

function planOneAttachment(
	state: AttachmentPlanState,
	attachment: IngestAttachmentPresignItem,
	index: number,
	allowedRunIds: Set<string> | null
): void {
	const violation = rejectByPolicy(attachment, index);
	if (violation !== null) {
		state.rejected.push(violation);
		return;
	}
	const rows = state.rowsBySourceRef.get(attachment.sourceRef) ?? [];
	if (rows.length === 0) {
		state.rejected.push({
			index,
			reason: REASON_UNMATCHED,
			runName: null,
			sourceRef: attachment.sourceRef,
		});
		return;
	}
	const buckets = bucketCandidateRows(rows, allowedRunIds);
	state.rejected.push(
		...buildBlockedRejections(
			index,
			attachment.sourceRef,
			buckets.pendingReviewRunNames,
			describePendingReview
		)
	);
	if (buckets.targets.length === 0) {
		state.rejected.push(
			...explainNoTarget(index, attachment.sourceRef, buckets)
		);
		return;
	}
	for (const target of buckets.targets) {
		pushUploadItem(state.groupByRunId, target, {
			contentType: attachment.contentType,
			index,
			kind: attachment.kind,
			runCaseId: target.runCaseId,
			sizeBytes: attachment.sizeBytes,
			sourceRef: attachment.sourceRef,
		});
	}
}

export function planAttachmentUploads(
	input: PlanAttachmentUploadsInput
): PlannedAttachmentUploads {
	const state: AttachmentPlanState = {
		groupByRunId: new Map<string, AttachmentUploadGroup>(),
		rejected: [],
		rowsBySourceRef: groupRowsBySourceRef(input.rows),
	};
	const allowedRunIds =
		input.runIds === null ? null : new Set<string>(input.runIds);
	for (const [index, attachment] of input.attachments.entries()) {
		planOneAttachment(state, attachment, index, allowedRunIds);
	}
	const groups = [...state.groupByRunId.values()]
		.map((group) => applyRunQuota(group, state.rejected))
		.filter((group) => group.items.length > 0);
	return { groups, rejected: sortByIndex(state.rejected) };
}

function sortByIndex(
	rejections: IngestAttachmentRejection[]
): IngestAttachmentRejection[] {
	return [...rejections].sort((left, right) => left.index - right.index);
}

import type { TestRunAttachmentKind } from "@automationstack/db/schema/test-runs";

import {
	type IngestAttachmentRejection,
	MAX_AUTOMATION_ATTACHMENT_BYTES_PER_RUN,
	MAX_AUTOMATION_ATTACHMENTS_PER_RUN,
} from "./attachment-contract";
import type { WritableTarget } from "./attachment-plan-buckets";

const BYTES_PER_MIB = 1024 * 1024;

function describeQuotaExhausted(runName: string): string {
	const maxMib = Math.floor(
		MAX_AUTOMATION_ATTACHMENT_BYTES_PER_RUN / BYTES_PER_MIB
	);
	return `测试任务「${runName}」的自动化附件配额已用完（单次最多 ${MAX_AUTOMATION_ATTACHMENTS_PER_RUN} 个、合计 ${maxMib} MiB），本条未获签名`;
}

export interface AttachmentUploadItem {
	contentType: string;
	index: number;
	kind: TestRunAttachmentKind;
	runCaseId: string;
	sizeBytes: number;
	sourceRef: string;
}

export interface AttachmentUploadGroup {
	items: AttachmentUploadItem[];
	runId: string;
	runName: string;
}

export function pushUploadItem(
	groupByRunId: Map<string, AttachmentUploadGroup>,
	target: WritableTarget,
	item: AttachmentUploadItem
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

export function applyRunQuota(
	group: AttachmentUploadGroup,
	rejected: IngestAttachmentRejection[]
): AttachmentUploadGroup {
	const accepted: AttachmentUploadItem[] = [];
	let totalBytes = 0;
	let exhausted = false;
	for (const item of group.items) {
		const fitsCount = accepted.length < MAX_AUTOMATION_ATTACHMENTS_PER_RUN;
		const fitsBytes =
			totalBytes + item.sizeBytes <= MAX_AUTOMATION_ATTACHMENT_BYTES_PER_RUN;
		if (exhausted || !(fitsCount && fitsBytes)) {
			exhausted = true;
			rejected.push({
				index: item.index,
				reason: describeQuotaExhausted(group.runName),
				runName: group.runName,
				sourceRef: item.sourceRef,
			});
			continue;
		}
		accepted.push(item);
		totalBytes += item.sizeBytes;
	}
	return { items: accepted, runId: group.runId, runName: group.runName };
}

export function buildGroupRejections(
	group: AttachmentUploadGroup,
	reason: string
): IngestAttachmentRejection[] {
	return group.items.map((item) => ({
		index: item.index,
		reason,
		runName: group.runName,
		sourceRef: item.sourceRef,
	}));
}

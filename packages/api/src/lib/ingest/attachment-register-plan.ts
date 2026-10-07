import type {
	IngestAttachmentRegisterItem,
	IngestAttachmentRegisterRejection,
} from "./attachment-contract";

export interface AttachmentRegisterItem extends IngestAttachmentRegisterItem {
	index: number;
}

export interface AttachmentRegisterGroup {
	items: AttachmentRegisterItem[];
	runId: string;
}

export function groupRegisterItemsByRunId(
	items: IngestAttachmentRegisterItem[]
): AttachmentRegisterGroup[] {
	const groupByRunId = new Map<string, AttachmentRegisterGroup>();
	for (const [index, item] of items.entries()) {
		const group = groupByRunId.get(item.runId);
		if (group) {
			group.items.push({ ...item, index });
			continue;
		}
		groupByRunId.set(item.runId, {
			items: [{ ...item, index }],
			runId: item.runId,
		});
	}
	return [...groupByRunId.values()];
}

export function buildRegisterRejections(
	items: AttachmentRegisterItem[],
	reason: string
): IngestAttachmentRegisterRejection[] {
	return items.map((item) => ({
		index: item.index,
		reason,
		runCaseId: item.runCaseId,
		storageKey: item.storageKey,
	}));
}

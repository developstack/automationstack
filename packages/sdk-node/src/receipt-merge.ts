import type {
	IngestExecutionReceipt,
	IngestWrittenToEntry,
} from "./contract-types.js";

export function mergeReceipts(
	receipts: IngestExecutionReceipt[]
): IngestExecutionReceipt {
	const writtenTo = new Map<string, IngestWrittenToEntry>();
	const merged: IngestExecutionReceipt = {
		executionId: receipts[0]?.executionId ?? "",
		outOfScope: [],
		skippedManual: [],
		unmatchedCases: [],
		writtenTo: [],
	};
	for (const receipt of receipts) {
		merged.outOfScope.push(...receipt.outOfScope);
		merged.skippedManual.push(...receipt.skippedManual);
		merged.unmatchedCases.push(...receipt.unmatchedCases);
		for (const entry of receipt.writtenTo) {
			const existing = writtenTo.get(entry.runId);
			writtenTo.set(entry.runId, {
				runId: entry.runId,
				runName: entry.runName,
				updated: (existing?.updated ?? 0) + entry.updated,
			});
		}
	}
	merged.writtenTo = [...writtenTo.values()];
	return merged;
}

export function hasNoWrites(receipt: IngestExecutionReceipt): boolean {
	return receipt.writtenTo.length === 0;
}

package org.automationstack.sdk;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public final class ReceiptMerge {

    private ReceiptMerge() {
    }

    public static IngestExecutionReceipt mergeReceipts(List<IngestExecutionReceipt> receipts) {
        List<IngestOutOfScopeEntry> outOfScope = new ArrayList<>();
        List<IngestSkippedManualEntry> skippedManual = new ArrayList<>();
        List<IngestUnmatchedCaseEntry> unmatchedCases = new ArrayList<>();
        Map<String, IngestWrittenToEntry> writtenTo = new LinkedHashMap<>();
        for (IngestExecutionReceipt receipt : receipts) {
            outOfScope.addAll(receipt.outOfScope());
            skippedManual.addAll(receipt.skippedManual());
            unmatchedCases.addAll(receipt.unmatchedCases());
            for (IngestWrittenToEntry entry : receipt.writtenTo()) {
                IngestWrittenToEntry existing = writtenTo.get(entry.runId());
                int updated = (existing == null ? 0 : existing.updated()) + entry.updated();
                writtenTo.put(entry.runId(),
                        new IngestWrittenToEntry(entry.runId(), entry.runName(), updated));
            }
        }
        return new IngestExecutionReceipt(
                receipts.isEmpty() ? "" : receipts.get(0).executionId(),
                List.copyOf(outOfScope),
                List.copyOf(skippedManual),
                List.copyOf(unmatchedCases),
                List.copyOf(writtenTo.values()));
    }

    public static boolean hasNoWrites(IngestExecutionReceipt receipt) {
        return receipt.writtenTo().isEmpty();
    }
}

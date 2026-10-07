package org.automationstack.sdk;

import java.util.List;
import java.util.Map;

public record IngestExecutionReceipt(
        String executionId,
        List<IngestOutOfScopeEntry> outOfScope,
        List<IngestSkippedManualEntry> skippedManual,
        List<IngestUnmatchedCaseEntry> unmatchedCases,
        List<IngestWrittenToEntry> writtenTo) {

    public static IngestExecutionReceipt fromWire(Map<String, Object> raw) {
        return new IngestExecutionReceipt(
                Wire.stringOrEmpty(raw, "executionId"),
                Wire.objectList(raw, "outOfScope").stream()
                        .map(IngestOutOfScopeEntry::fromWire).toList(),
                Wire.objectList(raw, "skippedManual").stream()
                        .map(IngestSkippedManualEntry::fromWire).toList(),
                Wire.objectList(raw, "unmatchedCases").stream()
                        .map(IngestUnmatchedCaseEntry::fromWire).toList(),
                Wire.objectList(raw, "writtenTo").stream()
                        .map(IngestWrittenToEntry::fromWire).toList());
    }
}

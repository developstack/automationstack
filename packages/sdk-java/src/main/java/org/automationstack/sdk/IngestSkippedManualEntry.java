package org.automationstack.sdk;

import java.util.Map;

public record IngestSkippedManualEntry(String reason, String runName, String sourceRef) {

    static IngestSkippedManualEntry fromWire(Map<String, Object> raw) {
        return new IngestSkippedManualEntry(
                Wire.requiredString(raw, "reason"),
                Wire.requiredString(raw, "runName"),
                Wire.requiredString(raw, "sourceRef"));
    }
}

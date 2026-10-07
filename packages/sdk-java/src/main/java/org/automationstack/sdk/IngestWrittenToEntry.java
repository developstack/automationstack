package org.automationstack.sdk;

import java.util.Map;

public record IngestWrittenToEntry(String runId, String runName, int updated) {

    static IngestWrittenToEntry fromWire(Map<String, Object> raw) {
        return new IngestWrittenToEntry(
                Wire.requiredString(raw, "runId"),
                Wire.requiredString(raw, "runName"),
                Wire.intOrDefault(raw, "updated", 0));
    }
}

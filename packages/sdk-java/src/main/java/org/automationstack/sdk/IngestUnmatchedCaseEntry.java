package org.automationstack.sdk;

import java.util.Map;

public record IngestUnmatchedCaseEntry(String reason, String sourceRef) {

    static IngestUnmatchedCaseEntry fromWire(Map<String, Object> raw) {
        return new IngestUnmatchedCaseEntry(
                Wire.requiredString(raw, "reason"),
                Wire.requiredString(raw, "sourceRef"));
    }
}

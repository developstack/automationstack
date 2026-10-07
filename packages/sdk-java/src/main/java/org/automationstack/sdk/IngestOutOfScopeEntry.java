package org.automationstack.sdk;

import java.util.Map;

public record IngestOutOfScopeEntry(String caseId, String reason, String runName, String sourceRef) {

    static IngestOutOfScopeEntry fromWire(Map<String, Object> raw) {
        return new IngestOutOfScopeEntry(
                Wire.stringOrEmpty(raw, "caseId"),
                Wire.requiredString(raw, "reason"),
                Wire.nullableString(raw, "runName"),
                Wire.requiredString(raw, "sourceRef"));
    }
}

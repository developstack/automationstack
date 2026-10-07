package org.automationstack.sdk;

import java.util.Map;

public record IngestAttachmentRejection(int index, String reason, String runName, String sourceRef) {

    static IngestAttachmentRejection fromWire(Map<String, Object> raw) {
        return new IngestAttachmentRejection(
                Wire.intOrDefault(raw, "index", -1),
                Wire.requiredString(raw, "reason"),
                Wire.nullableString(raw, "runName"),
                Wire.stringOrEmpty(raw, "sourceRef"));
    }
}

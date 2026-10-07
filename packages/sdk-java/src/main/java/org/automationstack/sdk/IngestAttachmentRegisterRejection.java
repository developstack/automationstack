package org.automationstack.sdk;

import java.util.Map;

public record IngestAttachmentRegisterRejection(
        int index, String reason, String runCaseId, String storageKey) {

    static IngestAttachmentRegisterRejection fromWire(Map<String, Object> raw) {
        return new IngestAttachmentRegisterRejection(
                Wire.intOrDefault(raw, "index", -1),
                Wire.requiredString(raw, "reason"),
                Wire.stringOrEmpty(raw, "runCaseId"),
                Wire.stringOrEmpty(raw, "storageKey"));
    }
}

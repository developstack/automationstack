package org.automationstack.sdk;

import java.util.Map;

public record IngestAttachmentUpload(
        String contentType,
        int index,
        String runCaseId,
        String runId,
        String runName,
        String sourceRef,
        String storageKey,
        String uploadUrl) {

    static IngestAttachmentUpload fromWire(Map<String, Object> raw) {
        return new IngestAttachmentUpload(
                Wire.requiredString(raw, "contentType"),
                Wire.intOrDefault(raw, "index", -1),
                Wire.requiredString(raw, "runCaseId"),
                Wire.requiredString(raw, "runId"),
                Wire.stringOrEmpty(raw, "runName"),
                Wire.stringOrEmpty(raw, "sourceRef"),
                Wire.requiredString(raw, "storageKey"),
                Wire.requiredString(raw, "uploadUrl"));
    }
}

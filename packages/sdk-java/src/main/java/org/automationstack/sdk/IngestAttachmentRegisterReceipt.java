package org.automationstack.sdk;

import java.util.List;
import java.util.Map;

public record IngestAttachmentRegisterReceipt(
        int registeredCount, List<IngestAttachmentRegisterRejection> rejected, boolean storageConfigured) {

    public static IngestAttachmentRegisterReceipt fromWire(Map<String, Object> raw) {
        return new IngestAttachmentRegisterReceipt(
                Wire.objectList(raw, "registered").size(),
                Wire.objectList(raw, "rejected").stream()
                        .map(IngestAttachmentRegisterRejection::fromWire).toList(),
                Wire.boolOrDefault(raw, "storageConfigured", false));
    }
}

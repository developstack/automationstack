package org.automationstack.sdk;

import java.util.List;
import java.util.Map;

public record IngestAttachmentPresignReceipt(
        int expiresInSeconds,
        List<IngestAttachmentRejection> rejected,
        boolean storageConfigured,
        List<IngestAttachmentUpload> uploads) {

    public static IngestAttachmentPresignReceipt fromWire(Map<String, Object> raw) {
        return new IngestAttachmentPresignReceipt(
                Wire.intOrDefault(raw, "expiresInSeconds", 0),
                Wire.objectList(raw, "rejected").stream()
                        .map(IngestAttachmentRejection::fromWire).toList(),
                Wire.boolOrDefault(raw, "storageConfigured", false),
                Wire.objectList(raw, "uploads").stream()
                        .map(IngestAttachmentUpload::fromWire).toList());
    }
}

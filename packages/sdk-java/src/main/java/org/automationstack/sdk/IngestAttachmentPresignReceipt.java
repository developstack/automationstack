package org.automationstack.sdk;

import java.util.List;
import java.util.Map;

/**
 * presign 的对账单。
 *
 * @param storageConfigured R2 未配置时为 false，此时 {@code uploads} 为空、
 *                          每项各有一条 {@code rejected}。**仍然是 200**——
 *                          结论那一轮早就写进去了，附件降级不该被表达成一次失败的请求。
 */
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

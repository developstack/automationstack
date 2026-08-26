package org.automationstack.sdk;

import java.util.Map;

/**
 * presign 回来的一个上传位。
 *
 * @param contentType 签名时锁定的值，PUT 时必须**逐字**带上，大小写都不能变。
 * @param index       请求里 {@code attachments} 数组的下标——同一个本地文件可能拿到多个 URL（D33）。
 */
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

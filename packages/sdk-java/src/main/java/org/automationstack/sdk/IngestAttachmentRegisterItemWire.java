package org.automationstack.sdk;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * register 请求里的一项。
 *
 * @param runCaseId presign 那一轮返回的值，**原样回传，不要自己拼**。
 */
public record IngestAttachmentRegisterItemWire(
        String fileName, AttachmentKind kind, String runCaseId, String runId, String storageKey) {

    Map<String, Object> toWire() {
        Map<String, Object> wire = new LinkedHashMap<>();
        wire.put("fileName", fileName);
        wire.put("kind", kind.wire());
        wire.put("runCaseId", runCaseId);
        wire.put("runId", runId);
        wire.put("storageKey", storageKey);
        return wire;
    }
}

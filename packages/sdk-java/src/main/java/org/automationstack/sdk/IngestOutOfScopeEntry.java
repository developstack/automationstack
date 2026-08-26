package org.automationstack.sdk;

import java.util.Map;

/**
 * 用例存在，但不在任何收得下它的任务范围里。
 *
 * @param runName 「没有任何未提交任务收它」时为 null；某个具体任务拒了它时是那个任务的名字。
 */
public record IngestOutOfScopeEntry(String caseId, String reason, String runName, String sourceRef) {

    static IngestOutOfScopeEntry fromWire(Map<String, Object> raw) {
        return new IngestOutOfScopeEntry(
                Wire.stringOrEmpty(raw, "caseId"),
                Wire.requiredString(raw, "reason"),
                Wire.nullableString(raw, "runName"),
                Wire.requiredString(raw, "sourceRef"));
    }
}

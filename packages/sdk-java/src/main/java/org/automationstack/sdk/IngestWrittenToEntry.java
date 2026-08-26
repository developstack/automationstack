package org.automationstack.sdk;

import java.util.Map;

/** 对账单里「这一轮往哪个测试任务写了几条」。 */
public record IngestWrittenToEntry(String runId, String runName, int updated) {

    static IngestWrittenToEntry fromWire(Map<String, Object> raw) {
        return new IngestWrittenToEntry(
                Wire.requiredString(raw, "runId"),
                Wire.requiredString(raw, "runName"),
                Wire.intOrDefault(raw, "updated", 0));
    }
}

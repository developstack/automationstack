package org.automationstack.sdk;

import java.util.Map;

/** 被「人工执行过、不许自动化覆盖」挡下来的那些。 */
public record IngestSkippedManualEntry(String reason, String runName, String sourceRef) {

    static IngestSkippedManualEntry fromWire(Map<String, Object> raw) {
        return new IngestSkippedManualEntry(
                Wire.requiredString(raw, "reason"),
                Wire.requiredString(raw, "runName"),
                Wire.requiredString(raw, "sourceRef"));
    }
}

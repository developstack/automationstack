package org.automationstack.sdk;

import java.util.Map;

/** 项目里压根没有这个 sourceRef 的用例。 */
public record IngestUnmatchedCaseEntry(String reason, String sourceRef) {

    static IngestUnmatchedCaseEntry fromWire(Map<String, Object> raw) {
        return new IngestUnmatchedCaseEntry(
                Wire.requiredString(raw, "reason"),
                Wire.requiredString(raw, "sourceRef"));
    }
}

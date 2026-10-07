package org.automationstack.sdk;

import java.util.LinkedHashMap;
import java.util.Map;

public record IngestExecutionResultWire(
        Long durationMs, String message, AutomationCaseResult result, String sourceRef) {

    Map<String, Object> toWire() {
        Map<String, Object> wire = new LinkedHashMap<>();
        wire.put("durationMs", durationMs);
        wire.put("message", message);
        wire.put("result", result.wire());
        wire.put("sourceRef", sourceRef);
        return wire;
    }
}

package org.automationstack.sdk;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 请求体里的一条结果。
 *
 * @param durationMs ⚠️ 服务端收下但**本期不落库**（{@code test_run_cases} 没有这一列）。
 *                   照发不误：字段在契约里，少发一个字段只会让以后加列时三家 SDK 各改一遍。
 */
public record IngestExecutionResultWire(
        Long durationMs, String message, AutomationCaseResult result, String sourceRef) {

    /** 键序与 Node / Python 两家一致，方便抓包比对。 */
    Map<String, Object> toWire() {
        Map<String, Object> wire = new LinkedHashMap<>();
        wire.put("durationMs", durationMs);
        wire.put("message", message);
        wire.put("result", result.wire());
        wire.put("sourceRef", sourceRef);
        return wire;
    }
}

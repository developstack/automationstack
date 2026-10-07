package org.automationstack.sdk;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public record IngestExecutionRequestWire(
        String branch,
        String ciUrl,
        String commitSha,
        String finishedAt,
        String idempotencyKey,
        boolean overwriteManual,
        String projectId,
        List<IngestExecutionResultWire> results,
        List<String> runIds,
        String startedAt) {

    Map<String, Object> toWire() {
        Map<String, Object> wire = new LinkedHashMap<>();
        wire.put("branch", branch);
        wire.put("ciUrl", ciUrl);
        wire.put("commitSha", commitSha);
        wire.put("finishedAt", finishedAt);
        wire.put("idempotencyKey", idempotencyKey);
        wire.put("overwriteManual", overwriteManual);
        wire.put("projectId", projectId);
        wire.put("results", results.stream().map(IngestExecutionResultWire::toWire).toList());
        wire.put("runIds", runIds);
        wire.put("startedAt", startedAt);
        return wire;
    }
}

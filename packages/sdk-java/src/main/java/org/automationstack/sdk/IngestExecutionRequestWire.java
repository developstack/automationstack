package org.automationstack.sdk;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * {@code POST /ingest/executions} 的请求体。
 *
 * <p>**没有单数的 {@code runId}**——服务端把那个键声明成了 {@code z.never()}，
 * 发过去是一条 400，而不是被静默 strip（D31）。所以这里连字段都不留。
 */
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

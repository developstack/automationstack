package org.automationstack.sdk;

import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;

public final class ExecutionBatches {

    private static final String TRUNCATION_SUFFIX = "…（已截断，完整堆栈见 log 附件）";

    private static final DateTimeFormatter ISO_MILLIS =
            DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'").withZone(ZoneOffset.UTC);

    private ExecutionBatches() {
    }

    public static String truncateMessage(String message) {
        if (message == null || message.isEmpty()) {
            return null;
        }
        if (message.length() <= ContractLimits.MAX_INGEST_COMMENT_LENGTH) {
            return message;
        }
        int keep = ContractLimits.MAX_INGEST_COMMENT_LENGTH - TRUNCATION_SUFFIX.length();
        return message.substring(0, keep) + TRUNCATION_SUFFIX;
    }

    public static List<List<CaseResultInput>> chunkResults(List<CaseResultInput> results) {
        return chunkResults(results, ContractLimits.RESULTS_PER_BATCH);
    }

    public static List<List<CaseResultInput>> chunkResults(List<CaseResultInput> results, int batchSize) {
        List<List<CaseResultInput>> batches = new ArrayList<>();
        if (results.isEmpty()) {
            batches.add(List.of());
            return batches;
        }
        for (int start = 0; start < results.size(); start += batchSize) {
            batches.add(List.copyOf(results.subList(start, Math.min(start + batchSize, results.size()))));
        }
        return batches;
    }

    public static List<IngestExecutionRequestWire> buildExecutionRequests(
            ReporterConfig config, List<CaseResultInput> results, ExecutionWindow window) {
        String startedAt = toIso(window.startedAt());
        String finishedAt = toIso(window.finishedAt());
        List<List<CaseResultInput>> batches = chunkResults(results);
        List<IngestExecutionRequestWire> requests = new ArrayList<>(batches.size());
        for (int batchIndex = 0; batchIndex < batches.size(); batchIndex++) {
            requests.add(new IngestExecutionRequestWire(
                    config.branch(),
                    config.ciUrl(),
                    config.commitSha(),
                    finishedAt,
                    Idempotency.deriveBatchIdempotencyKey(config.idempotencyKey(), batchIndex),
                    config.overwriteManual(),
                    config.projectId(),
                    batches.get(batchIndex).stream().map(ExecutionBatches::toWireResult).toList(),
                    config.runIds(),
                    startedAt));
        }
        return requests;
    }

    private static IngestExecutionResultWire toWireResult(CaseResultInput input) {
        return new IngestExecutionResultWire(
                input.durationMs(), truncateMessage(input.message()), input.result(), input.sourceRef());
    }

    private static String toIso(Instant moment) {
        return moment == null ? null : ISO_MILLIS.format(moment);
    }
}

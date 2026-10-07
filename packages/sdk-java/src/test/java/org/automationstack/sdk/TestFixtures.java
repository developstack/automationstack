package org.automationstack.sdk;

import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public final class TestFixtures {

    public static final String RUN_KEY = "3f2a1b4c-5d6e-4f70-8912-a3b4c5d6e7f8";
    public static final String BASE_URL = "https://qa.example.com";
    public static final String PROJECT_ID = "11111111-2222-4333-8444-555555555555";
    public static final String TOKEN = "as_live_xxxxxxxx";
    public static final String EXECUTION_ID = "22222222-3333-4444-8555-666666666666";

    private TestFixtures() {
    }

    public static ReporterConfig baseConfig() {
        return new ReporterConfig(
                BASE_URL, null, null, null, RUN_KEY, false, PROJECT_ID, null, TOKEN);
    }

    public static ExecutionWindow window() {
        return new ExecutionWindow(
                Instant.parse("2026-01-01T00:00:00Z"), Instant.parse("2026-01-01T00:01:02.345Z"));
    }

    public static AutomationStackReporter.Builder reporter(
            RecordingTransport transport, CollectingSink sink) {
        return AutomationStackReporter.builder()
                .config(baseConfig())
                .transport(transport)
                .sink(sink)
                .sleeper(millis -> { })
                .startedAt(Instant.parse("2026-01-01T00:00:00Z"))
                .timeout(Duration.ofSeconds(1));
    }

    public static IngestExecutionReceipt receiptWith(
            List<IngestWrittenToEntry> writtenTo,
            List<IngestUnmatchedCaseEntry> unmatched,
            List<IngestOutOfScopeEntry> outOfScope,
            List<IngestSkippedManualEntry> skippedManual) {
        return new IngestExecutionReceipt(
                EXECUTION_ID, outOfScope, skippedManual, unmatched, writtenTo);
    }

    public static IngestExecutionReceipt emptyReceipt() {
        return receiptWith(List.of(), List.of(), List.of(), List.of());
    }

    public static String receiptJson(List<Map<String, Object>> writtenTo) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("executionId", EXECUTION_ID);
        body.put("writtenTo", writtenTo);
        body.put("unmatchedCases", List.of());
        body.put("outOfScope", List.of());
        body.put("skippedManual", List.of());
        return Json.encode(body);
    }

    public static Map<String, Object> writtenToWire(String runId, String runName, int updated) {
        Map<String, Object> entry = new LinkedHashMap<>();
        entry.put("runId", runId);
        entry.put("runName", runName);
        entry.put("updated", updated);
        return entry;
    }

    public static HttpResponse json(int status, String body) {
        return new HttpResponse(status, body.getBytes(StandardCharsets.UTF_8));
    }

    public static final class RecordingTransport implements Transport {

        public final List<HttpRequest> requests = new ArrayList<>();
        private final Deque<Object> queued = new ArrayDeque<>();

        public RecordingTransport queue(HttpResponse response) {
            queued.add(response);
            return this;
        }

        public RecordingTransport queueJson(String body) {
            return queue(json(200, body));
        }

        public RecordingTransport queueFailure(Exception error) {
            queued.add(error);
            return this;
        }

        public String bodyOf(int index) {
            return new String(requests.get(index).body(), StandardCharsets.UTF_8);
        }

        @Override
        public HttpResponse send(HttpRequest request) throws Exception {
            requests.add(request);
            if (queued.isEmpty()) {
                throw new IllegalStateException("没有为 " + request.url() + " 排响应");
            }
            Object next = queued.poll();
            if (next instanceof Exception error) {
                throw error;
            }
            return (HttpResponse) next;
        }
    }

    public static final class CollectingSink implements ReceiptSink {

        public final List<String> lines = new ArrayList<>();

        @Override
        public void accept(String line) {
            lines.add(line);
        }

        public String text() {
            return String.join("\n", lines);
        }
    }
}

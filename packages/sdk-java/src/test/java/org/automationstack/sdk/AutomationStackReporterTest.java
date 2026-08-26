package org.automationstack.sdk;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

/** §7.2 那五条铁律，逐条盯住。 */
class AutomationStackReporterTest {

    private static final String OK_RECEIPT =
            TestFixtures.receiptJson(List.of(TestFixtures.writtenToWire("r1", "冒烟", 2)));

    @Test
    void addResultBuffersAndSendsNothing() {
        // 第 1 条：跑一条报一条既慢又碎（D29）。
        TestFixtures.RecordingTransport transport = new TestFixtures.RecordingTransport();
        AutomationStackReporter reporter =
                TestFixtures.reporter(transport, new TestFixtures.CollectingSink()).build();
        reporter.addResult(CaseResultInput.of("PAY-1", AutomationCaseResult.PASSED));
        reporter.addResults(List.of(CaseResultInput.of("PAY-2", AutomationCaseResult.FAILED, "boom")));
        reporter.addAttachment(AttachmentInput.ofBytes("PAY-1", AttachmentKind.LOG, new byte[] {1}));
        assertEquals(0, transport.requests.size(), "finish() 之前不该有任何请求");
        assertEquals(2, reporter.pendingResultCount());
    }

    @Test
    void finishSendsOneExecutionPostAndPrintsTheReceipt() {
        TestFixtures.RecordingTransport transport = new TestFixtures.RecordingTransport().queueJson(OK_RECEIPT);
        TestFixtures.CollectingSink sink = new TestFixtures.CollectingSink();
        AutomationStackReporter reporter = TestFixtures.reporter(transport, sink).build();
        reporter.addResult(CaseResultInput.of("PAY-1", AutomationCaseResult.PASSED));
        RunOutcome outcome = reporter.finish();

        assertEquals(1, transport.requests.size());
        assertEquals("https://qa.example.com/ingest/executions", transport.requests.get(0).url());
        assertEquals(TestFixtures.EXECUTION_ID, outcome.receipt().executionId());
        // 第 3 条：对账单一定会打出来，writtenTo 逐任务一行。
        assertEquals("[automationstack] 上报对账单（execution " + TestFixtures.EXECUTION_ID + "）",
                sink.lines.get(0));
        assertTrue(sink.lines.get(1).contains("《冒烟》"));
        assertTrue(sink.lines.get(1).contains("2 条"));
    }

    @Test
    void requestBodyMatchesTheContractShape() {
        TestFixtures.RecordingTransport transport = new TestFixtures.RecordingTransport().queueJson(OK_RECEIPT);
        AutomationStackReporter reporter =
                TestFixtures.reporter(transport, new TestFixtures.CollectingSink()).build();
        reporter.addResult(new CaseResultInput("PAY-1", AutomationCaseResult.PASSED, 1200L, null));
        reporter.finish();
        String body = transport.bodyOf(0);
        assertTrue(body.contains("\"idempotencyKey\":\"" + TestFixtures.RUN_KEY + "\""), body);
        assertTrue(body.contains("\"projectId\":\"" + TestFixtures.PROJECT_ID + "\""), body);
        assertTrue(body.contains("\"sourceRef\":\"PAY-1\""), body);
        assertTrue(body.contains("\"result\":\"passed\""), body);
        assertTrue(body.contains("\"durationMs\":1200"), body);
        assertTrue(body.contains("\"startedAt\":\"2026-01-01T00:00:00.000Z\""), body);
        // D31：单数 runId 是 z.never()，发过去是一条 400。
        assertTrue(!body.contains("\"runId\":"), body);
    }

    @Test
    void sendsOnePostPerBatchWithDerivedKeys() {
        // 第 2 条：一次进程一个 run key，每批从它派生；重试算出来的还是同一个。
        TestFixtures.RecordingTransport transport = new TestFixtures.RecordingTransport()
                .queueJson(OK_RECEIPT).queueJson(OK_RECEIPT);
        AutomationStackReporter reporter =
                TestFixtures.reporter(transport, new TestFixtures.CollectingSink()).build();
        List<CaseResultInput> results = new ArrayList<>();
        for (int index = 0; index < ContractLimits.RESULTS_PER_BATCH + 1; index++) {
            results.add(CaseResultInput.of("CASE-" + index, AutomationCaseResult.PASSED));
        }
        reporter.addResults(results);
        RunOutcome outcome = reporter.finish();

        assertEquals(2, transport.requests.size());
        assertTrue(transport.bodyOf(0).contains("\"idempotencyKey\":\"" + TestFixtures.RUN_KEY + "\""));
        assertTrue(transport.bodyOf(1).contains("\"idempotencyKey\":\""
                + Idempotency.deriveBatchIdempotencyKey(TestFixtures.RUN_KEY, 1) + "\""));
        // 两批的 writtenTo 合并成一行。
        assertEquals(1, outcome.receipt().writtenTo().size());
        assertEquals(4, outcome.receipt().writtenTo().get(0).updated());
    }

    @Test
    void emptyWrittenToThrowsWithEveryServerReasonVerbatim() {
        // 第 4 条：静默成功是最坏的情况。
        Map<String, Object> unmatched = Map.of("reason", "用例不存在或不属于本项目", "sourceRef", "PAY-9");
        String receipt = Json.encode(Map.of(
                "executionId", TestFixtures.EXECUTION_ID,
                "writtenTo", List.of(),
                "unmatchedCases", List.of(unmatched),
                "outOfScope", List.of(),
                "skippedManual", List.of()));
        TestFixtures.RecordingTransport transport = new TestFixtures.RecordingTransport().queueJson(receipt);
        TestFixtures.CollectingSink sink = new TestFixtures.CollectingSink();
        AutomationStackReporter reporter =
                TestFixtures.reporter(transport, sink).markExitSignal(false).build();
        reporter.addResult(CaseResultInput.of("PAY-9", AutomationCaseResult.PASSED));

        IngestEmptyWriteError error = assertThrows(IngestEmptyWriteError.class, reporter::finish);
        assertTrue(error.getMessage().contains("用例不存在或不属于本项目"));
        assertTrue(error.getMessage().contains("PAY-9"));
        assertNotNull(error.receipt());
        // 抛之前对账单已经打出来了：抛出去之后调用方可能什么都不打。
        assertEquals("写入 0 个测试任务", sink.lines.get(1));
    }

    @Test
    void marksTheProcessLevelExitSignalOnEmptyWrite() {
        ExitSignal.reset();
        try {
            TestFixtures.RecordingTransport transport = new TestFixtures.RecordingTransport()
                    .queueJson(TestFixtures.receiptJson(List.of()));
            AutomationStackReporter reporter =
                    TestFixtures.reporter(transport, new TestFixtures.CollectingSink()).build();
            assertThrows(IngestEmptyWriteError.class, reporter::finish);
            assertEquals(1, ExitSignal.exitCode());
        } finally {
            ExitSignal.reset();
        }
    }

    @Test
    void doesNotTouchTheExitSignalWhenOptedOut() {
        // JUnit 薄壳走的就是这条路：把失败翻译成一次测试失败，让 Surefire 决定退出码。
        ExitSignal.reset();
        try {
            TestFixtures.RecordingTransport transport = new TestFixtures.RecordingTransport()
                    .queueJson(TestFixtures.receiptJson(List.of()));
            AutomationStackReporter reporter = TestFixtures
                    .reporter(transport, new TestFixtures.CollectingSink()).markExitSignal(false).build();
            assertThrows(IngestEmptyWriteError.class, reporter::finish);
            assertEquals(0, ExitSignal.exitCode());
        } finally {
            ExitSignal.reset();
        }
    }

    @Test
    void emptyRunStillPostsSoTheServerCanExplainItself() {
        TestFixtures.RecordingTransport transport = new TestFixtures.RecordingTransport()
                .queueJson(TestFixtures.receiptJson(List.of()));
        AutomationStackReporter reporter = TestFixtures
                .reporter(transport, new TestFixtures.CollectingSink()).markExitSignal(false).build();
        assertThrows(IngestEmptyWriteError.class, reporter::finish);
        assertEquals(1, transport.requests.size());
        assertTrue(transport.bodyOf(0).contains("\"results\":[]"));
    }

    @Test
    void attachmentsAreFlushedAfterResults() {
        TestFixtures.RecordingTransport transport = new TestFixtures.RecordingTransport()
                .queueJson(OK_RECEIPT)
                .queueJson(Json.encode(Map.of(
                        "expiresInSeconds", 900,
                        "rejected", List.of(),
                        "storageConfigured", false,
                        "uploads", List.of())));
        TestFixtures.CollectingSink sink = new TestFixtures.CollectingSink();
        AutomationStackReporter reporter = TestFixtures.reporter(transport, sink).build();
        reporter.addResult(CaseResultInput.of("PAY-1", AutomationCaseResult.PASSED));
        reporter.addAttachment(AttachmentInput.ofBytes("PAY-1", AttachmentKind.LOG, new byte[] {1}));
        reporter.finish();

        assertEquals("https://qa.example.com/ingest/executions", transport.requests.get(0).url());
        assertEquals("https://qa.example.com/ingest/attachments/presign", transport.requests.get(1).url());
        // 附件降级不影响结论那一轮的成功。
        assertTrue(sink.text().contains("附件 存储未配置"));
    }

    @Test
    void truncatesOverlongMessagesBeforeSending() {
        TestFixtures.RecordingTransport transport = new TestFixtures.RecordingTransport().queueJson(OK_RECEIPT);
        AutomationStackReporter reporter =
                TestFixtures.reporter(transport, new TestFixtures.CollectingSink()).build();
        reporter.addResult(CaseResultInput.of("PAY-1", AutomationCaseResult.FAILED,
                "x".repeat(ContractLimits.MAX_INGEST_MESSAGE_LENGTH + 1000)));
        reporter.finish();
        assertTrue(transport.bodyOf(0).contains("log 附件）"));
        assertTrue(transport.bodyOf(0).length() < ContractLimits.MAX_INGEST_MESSAGE_LENGTH);
    }

    @Test
    void exposesTheRunKeyForLogging() {
        AutomationStackReporter reporter = TestFixtures
                .reporter(new TestFixtures.RecordingTransport(), new TestFixtures.CollectingSink()).build();
        assertEquals(TestFixtures.RUN_KEY, reporter.idempotencyKey());
    }
}

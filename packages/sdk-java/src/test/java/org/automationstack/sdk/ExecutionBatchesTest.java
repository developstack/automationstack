package org.automationstack.sdk;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;

/** 分批：每批一个派生出来的幂等键，空的一轮也要发（§7.2）。 */
class ExecutionBatchesTest {

    private static List<CaseResultInput> results(int count) {
        List<CaseResultInput> items = new ArrayList<>(count);
        for (int index = 0; index < count; index++) {
            items.add(CaseResultInput.of("CASE-" + index, AutomationCaseResult.PASSED));
        }
        return items;
    }

    @Test
    void emptyRunStillProducesOneBatch() {
        // 「过滤条件没匹配上任何用例」照样该留下执行记录，而且 writtenTo 为空
        // 这件事必须由服务端的对账单说出来——SDK 自己短路掉就没有理由可透传。
        assertEquals(1, ExecutionBatches.chunkResults(List.of()).size());
        assertEquals(List.of(), ExecutionBatches.chunkResults(List.of()).get(0));
    }

    @Test
    void chunksAtTheContractBatchSize() {
        List<List<CaseResultInput>> batches = ExecutionBatches.chunkResults(results(450));
        assertEquals(3, batches.size());
        assertEquals(ContractLimits.RESULTS_PER_BATCH, batches.get(0).size());
        assertEquals(ContractLimits.RESULTS_PER_BATCH, batches.get(1).size());
        assertEquals(50, batches.get(2).size());
    }

    @Test
    void exactMultipleDoesNotProduceAnEmptyTailBatch() {
        assertEquals(2, ExecutionBatches.chunkResults(results(400)).size());
    }

    @Test
    void batchSizeStaysWithinTheServerLimit() {
        assertTrue(ContractLimits.RESULTS_PER_BATCH <= ContractLimits.MAX_INGEST_RESULTS_PER_REQUEST);
        assertTrue(ContractLimits.ATTACHMENTS_PER_BATCH <= ContractLimits.MAX_INGEST_ATTACHMENTS_PER_REQUEST);
    }

    @Test
    void everyBatchGetsADistinctDerivedKey() {
        List<IngestExecutionRequestWire> requests = ExecutionBatches.buildExecutionRequests(
                TestFixtures.baseConfig(), results(450), TestFixtures.window());
        assertEquals(3, requests.size());
        // 批 0 就是 run key 本身。
        assertEquals(TestFixtures.RUN_KEY, requests.get(0).idempotencyKey());
        assertEquals(Idempotency.deriveBatchIdempotencyKey(TestFixtures.RUN_KEY, 1),
                requests.get(1).idempotencyKey());
        assertNotEquals(requests.get(1).idempotencyKey(), requests.get(2).idempotencyKey());
    }

    @Test
    void timestampsMatchNodeToIsoStringFormat() {
        // Instant.toString() 在毫秒为零时会把小数部分整个省掉，Node 的 toISOString() 不会。
        IngestExecutionRequestWire request = ExecutionBatches.buildExecutionRequests(
                TestFixtures.baseConfig(), results(1), TestFixtures.window()).get(0);
        assertEquals("2026-01-01T00:00:00.000Z", request.startedAt());
        assertEquals("2026-01-01T00:01:02.345Z", request.finishedAt());
    }

    @Test
    void truncatesOverlongMessagesWithAVisibleMarker() {
        String message = "x".repeat(ContractLimits.MAX_INGEST_COMMENT_LENGTH + 500);
        String truncated = ExecutionBatches.truncateMessage(message);
        assertEquals(ContractLimits.MAX_INGEST_COMMENT_LENGTH, truncated.length());
        // 人得知道下面还有内容，以及去哪找完整的那份。
        assertTrue(truncated.endsWith("log 附件）"));
    }

    @Test
    void keepsShortMessagesVerbatim() {
        assertEquals("boom", ExecutionBatches.truncateMessage("boom"));
        assertNull(ExecutionBatches.truncateMessage(null));
        assertNull(ExecutionBatches.truncateMessage(""));
    }
}

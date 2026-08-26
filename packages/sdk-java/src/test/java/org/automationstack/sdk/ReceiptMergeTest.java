package org.automationstack.sdk;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;
import org.junit.jupiter.api.Test;

/** 合并多批的对账单：只有 writtenTo 按 runId 累加，三类拒绝一条都不许合掉。 */
class ReceiptMergeTest {

    private static IngestExecutionReceipt receipt(String executionId, List<IngestWrittenToEntry> writtenTo) {
        return new IngestExecutionReceipt(executionId, List.of(), List.of(), List.of(), writtenTo);
    }

    @Test
    void sumsUpdatedCountsPerRun() {
        IngestExecutionReceipt merged = ReceiptMerge.mergeReceipts(List.of(
                receipt("e1", List.of(new IngestWrittenToEntry("r1", "冒烟", 3))),
                receipt("e2", List.of(
                        new IngestWrittenToEntry("r1", "冒烟", 2),
                        new IngestWrittenToEntry("r2", "回归", 5)))));
        assertEquals(2, merged.writtenTo().size());
        assertEquals(5, merged.writtenTo().get(0).updated());
        assertEquals("r1", merged.writtenTo().get(0).runId());
        assertEquals(5, merged.writtenTo().get(1).updated());
    }

    @Test
    void keepsFirstMentionOrder() {
        // 行序每次跑都一样，人才能一眼看出「有没有变化」。
        IngestExecutionReceipt merged = ReceiptMerge.mergeReceipts(List.of(
                receipt("e1", List.of(new IngestWrittenToEntry("r2", "回归", 1))),
                receipt("e2", List.of(new IngestWrittenToEntry("r1", "冒烟", 1)))));
        assertEquals(List.of("r2", "r1"), merged.writtenTo().stream().map(IngestWrittenToEntry::runId).toList());
    }

    @Test
    void takesExecutionIdFromTheFirstBatch() {
        assertEquals("e1", ReceiptMerge.mergeReceipts(List.of(
                receipt("e1", List.of()), receipt("e2", List.of()))).executionId());
        assertEquals("", ReceiptMerge.mergeReceipts(List.of()).executionId());
    }

    @Test
    void concatenatesRejectionsWithoutDeduplicating() {
        // 同一条 sourceRef 在两批里各被拒一次是两件事，合掉就少了一条要处理的。
        IngestUnmatchedCaseEntry unmatched = new IngestUnmatchedCaseEntry("用例不存在", "PAY-1");
        IngestExecutionReceipt merged = ReceiptMerge.mergeReceipts(List.of(
                new IngestExecutionReceipt("e1", List.of(), List.of(), List.of(unmatched), List.of()),
                new IngestExecutionReceipt("e2", List.of(), List.of(), List.of(unmatched), List.of())));
        assertEquals(2, merged.unmatchedCases().size());
    }

    @Test
    void keepsTheFourCategoriesSeparate() {
        IngestExecutionReceipt merged = ReceiptMerge.mergeReceipts(List.of(new IngestExecutionReceipt(
                "e1",
                List.of(new IngestOutOfScopeEntry("c1", "没有未提交的任务收它", "回归", "PAY-2")),
                List.of(new IngestSkippedManualEntry("已有人工结果", "冒烟", "PAY-3")),
                List.of(new IngestUnmatchedCaseEntry("用例不存在", "PAY-1")),
                List.of())));
        assertEquals(1, merged.outOfScope().size());
        assertEquals(1, merged.skippedManual().size());
        assertEquals(1, merged.unmatchedCases().size());
    }

    @Test
    void noWritesIsTheOnlyFailureSignal() {
        // 不看状态码：服务端这种情况下回的仍然是 200 加一份说明详尽的对账单（§5.8）。
        assertTrue(ReceiptMerge.hasNoWrites(TestFixtures.emptyReceipt()));
        assertFalse(ReceiptMerge.hasNoWrites(
                receipt("e1", List.of(new IngestWrittenToEntry("r1", "冒烟", 0)))));
    }
}

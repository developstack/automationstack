package org.automationstack.sdk;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;
import org.junit.jupiter.api.Test;

class ReceiptPrinterTest {

    @Test
    void countsCjkAsTwoColumns() {
        assertEquals(2, ReceiptPrinter.displayWidth("ab"));
        assertEquals(4, ReceiptPrinter.displayWidth("冒烟"));
        assertEquals(8, ReceiptPrinter.displayWidth("《冒烟》"));
        assertEquals(7, ReceiptPrinter.displayWidth("冒烟 v2"));
    }

    @Test
    void alignsRunNamesOfDifferentWidths() {
        List<String> lines = ReceiptPrinter.formatReceiptLines(TestFixtures.receiptWith(
                List.of(
                        new IngestWrittenToEntry("r1", "冒烟", 12),
                        new IngestWrittenToEntry("r2", "全量回归第二轮", 3)),
                List.of(), List.of(), List.of()));
        assertEquals("[automationstack] 上报对账单（execution " + TestFixtures.EXECUTION_ID + "）", lines.get(0));
        int first = lines.get(1).indexOf("12 条");
        int second = lines.get(2).indexOf("3 条");
        assertEquals(ReceiptPrinter.displayWidth(lines.get(1).substring(0, first)),
                ReceiptPrinter.displayWidth(lines.get(2).substring(0, second)));
    }

    @Test
    void alwaysPrintsALineWhenNothingWasWritten() {
        List<String> lines = ReceiptPrinter.formatReceiptLines(TestFixtures.emptyReceipt());
        assertEquals(2, lines.size());
        assertEquals("写入 0 个测试任务", lines.get(1));
    }

    @Test
    void passesServerReasonsThroughVerbatim() {
        List<String> lines = ReceiptPrinter.formatReceiptLines(TestFixtures.receiptWith(
                List.of(),
                List.of(new IngestUnmatchedCaseEntry("用例不存在或不属于本项目", "PAY-1")),
                List.of(new IngestOutOfScopeEntry("c9", "任务已提交，不再接收上报", "回归", "PAY-2")),
                List.of(new IngestSkippedManualEntry("已有人工结果，未开启覆盖", "冒烟", "PAY-3"))));
        String text = String.join("\n", lines);
        assertTrue(text.contains("跳过 1 条（已有人工结果，未开启覆盖）：PAY-3 @《冒烟》"));
        assertTrue(text.contains("未匹配 1 条（用例不存在或不属于本项目）：PAY-1"));
        assertTrue(text.contains("越界 1 条（任务已提交，不再接收上报）：PAY-2 @《回归》"));
    }

    @Test
    void groupsSameReasonTogether() {
        List<String> lines = ReceiptPrinter.formatReceiptLines(TestFixtures.receiptWith(
                List.of(),
                List.of(
                        new IngestUnmatchedCaseEntry("用例不存在", "PAY-1"),
                        new IngestUnmatchedCaseEntry("用例不存在", "PAY-2"),
                        new IngestUnmatchedCaseEntry("sourceRef 为空", "PAY-3")),
                List.of(), List.of()));
        assertEquals("未匹配 2 条（用例不存在）：PAY-1、PAY-2", lines.get(2));
        assertEquals("未匹配 1 条（sourceRef 为空）：PAY-3", lines.get(3));
    }

    @Test
    void attachmentLinesAreSilentWhenThereAreNoAttachments() {
        assertEquals(List.of(), ReceiptPrinter.formatAttachmentLines(new AttachmentOutcome()));
    }

    @Test
    void reportsStorageDegradationWithoutFailingTheRun() {
        AttachmentOutcome outcome = new AttachmentOutcome();
        outcome.degradeStorage(false);
        List<String> lines = ReceiptPrinter.formatAttachmentLines(outcome);
        assertEquals(List.of("附件 存储未配置，本轮附件全部跳过；结论已正常写入"), lines);
    }

    @Test
    void listsEveryAttachmentRejectionSeparately() {
        AttachmentOutcome outcome = new AttachmentOutcome();
        outcome.degradeStorage(true);
        outcome.addUploaded(2);
        outcome.addRegistered(1);
        outcome.rejections().add("PAY-1：配额已用完");
        List<String> lines = ReceiptPrinter.formatAttachmentLines(outcome);
        assertEquals("附件 已登记 1 个（上传 2 个）", lines.get(0));
        assertEquals("附件 被拒：PAY-1：配额已用完", lines.get(1));
    }

    @Test
    void printReceiptWritesEveryLineToTheSink() {
        TestFixtures.CollectingSink sink = new TestFixtures.CollectingSink();
        ReceiptPrinter.printReceipt(TestFixtures.emptyReceipt(), null, sink);
        assertEquals(2, sink.lines.size());
    }
}

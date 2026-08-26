package org.automationstack.sdk;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;
import org.junit.jupiter.api.Test;

/** 对账单是这次上报的**结果**，不是日志：每一行都要能被人照着做下一步。 */
class ReceiptPrinterTest {

    @Test
    void countsCjkAsTwoColumns() {
        assertEquals(2, ReceiptPrinter.displayWidth("ab"));
        assertEquals(4, ReceiptPrinter.displayWidth("冒烟"));
        // 《》本身也是全角（U+300A/U+300B 落在 2E80–4DBF 这一段），所以是 8 不是 6；
        // 与 sdk-node 的 CJK_PATTERN 逐区间一致。
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
        // 两行的「N 条」必须落在同一列上。
        int first = lines.get(1).indexOf("12 条");
        int second = lines.get(2).indexOf("3 条");
        assertEquals(ReceiptPrinter.displayWidth(lines.get(1).substring(0, first)),
                ReceiptPrinter.displayWidth(lines.get(2).substring(0, second)));
    }

    @Test
    void alwaysPrintsALineWhenNothingWasWritten() {
        // 什么都不打会让「一条都没写」和「日志被截断了」看起来一模一样。
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
        // 三类拒绝各自成行，理由一个字都不改写（§7.2 第 4 条）。
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
        // R2 没配置只是降级：结论那一轮早就写进去了（§5.6）。
        // 存储没配时 presign 回来的 uploads 就是空的，一个字节都没传上去——
        // 所以这里刻意**不**调 addUploaded：这一行必须在「零上传零拒绝」时照样打出来，
        // 否则用户排了附件却什么反馈都看不到。
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

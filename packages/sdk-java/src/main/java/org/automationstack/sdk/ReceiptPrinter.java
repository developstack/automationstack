package org.automationstack.sdk;

import java.io.PrintStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 对账单的渲染（§7.2 第 3 条）。**本包唯一往终端写东西的地方。**
 *
 * <p>集中在一处是有意的：散落各处的 {@code System.out.println} 会让「哪些信息一定会
 * 被打出来」变成一件要通读全包才能回答的事，而对账单是用户**唯一**的反馈渠道。
 * 渲染是纯函数（{@link #formatReceiptLines}），输出只有 {@link #printReceipt} 一处——
 * 测试断言的是前者，后者只负责把字符串交给 sink。
 *
 * <p>三类拒绝**按服务端给的 {@code reason} 原文分组**，一条不漏地列出 sourceRef。
 * 分组而不是逐行重复类别标题，是因为同一类里的理由通常只有两三种；但**理由本身
 * 一个字都不改写**——§7.2 第 4 条要的就是原样透传，SDK 自己概括一句「上报失败」
 * 会把「用例不存在」和「任务还在待评审」抹平成同一件事。
 */
public final class ReceiptPrinter {

    /**
     * 与 Node / Python 两家**同一组码位区间**。
     *
     * <p>没有用 {@code java.awt.font} 那一套，也没有按 East Asian Width 的
     * {@code Ambiguous} 类算宽：各家终端对那一类（比如「《》」两侧偶尔出现的希腊字母、
     * 箭头）的实际渲染并不一致。三家共用同一张表，打出来的对账单才能对得上行。
     */
    private static final int[][] WIDE_RANGES = {
        {0x1100, 0x115F}, {0x2E80, 0x4DBF}, {0x4E00, 0x9FFF}, {0xAC00, 0xD7A3},
        {0xF900, 0xFAFF}, {0xFE30, 0xFE4F}, {0xFF00, 0xFF60}, {0xFFE0, 0xFFE6},
    };

    private ReceiptPrinter() {
    }

    /** 中文按两格宽算，否则任务名一长一短时 {@code writtenTo} 那几行的数字对不齐。 */
    static int displayWidth(String text) {
        int width = 0;
        int index = 0;
        while (index < text.length()) {
            int codePoint = text.codePointAt(index);
            width += isWide(codePoint) ? 2 : 1;
            index += Character.charCount(codePoint);
        }
        return width;
    }

    private static boolean isWide(int codePoint) {
        for (int[] range : WIDE_RANGES) {
            if (codePoint >= range[0] && codePoint <= range[1]) {
                return true;
            }
        }
        return false;
    }

    private static String padToWidth(String text, int target) {
        int missing = Math.max(0, target - displayWidth(text));
        return text + " ".repeat(missing);
    }

    private record LabeledEntry(String label, String reason) {
    }

    private static List<String> groupByReason(List<LabeledEntry> entries, String category) {
        // LinkedHashMap：分组之后各类理由的出现顺序还是服务端给的顺序。
        Map<String, List<String>> grouped = new LinkedHashMap<>();
        for (LabeledEntry entry : entries) {
            grouped.computeIfAbsent(entry.reason(), key -> new ArrayList<>()).add(entry.label());
        }
        List<String> lines = new ArrayList<>(grouped.size());
        for (Map.Entry<String, List<String>> group : grouped.entrySet()) {
            lines.add(category + " " + group.getValue().size() + " 条（" + group.getKey() + "）："
                    + String.join("、", group.getValue()));
        }
        return lines;
    }

    private static List<String> formatWrittenTo(IngestExecutionReceipt receipt) {
        List<String> names = receipt.writtenTo().stream()
                .map(entry -> "《" + entry.runName() + "》").toList();
        int widest = 0;
        for (String name : names) {
            widest = Math.max(widest, displayWidth(name));
        }
        List<String> lines = new ArrayList<>(names.size());
        for (int index = 0; index < names.size(); index++) {
            lines.add("写入 " + padToWidth(names.get(index), widest) + "  "
                    + receipt.writtenTo().get(index).updated() + " 条");
        }
        return lines;
    }

    /**
     * ⚠️ {@code writtenTo} 为空时**也要打**一行说明。
     * 什么都不打会让「一条都没写」和「日志被截断了」看起来一模一样。
     */
    public static List<String> formatReceiptLines(IngestExecutionReceipt receipt) {
        List<String> lines = new ArrayList<>();
        lines.add("[automationstack] 上报对账单（execution " + receipt.executionId() + "）");
        if (receipt.writtenTo().isEmpty()) {
            lines.add("写入 0 个测试任务");
        } else {
            lines.addAll(formatWrittenTo(receipt));
        }
        lines.addAll(groupByReason(receipt.skippedManual().stream()
                .map(entry -> new LabeledEntry(
                        entry.sourceRef() + " @《" + entry.runName() + "》", entry.reason()))
                .toList(), "跳过"));
        lines.addAll(groupByReason(receipt.unmatchedCases().stream()
                .map(entry -> new LabeledEntry(entry.sourceRef(), entry.reason()))
                .toList(), "未匹配"));
        lines.addAll(groupByReason(receipt.outOfScope().stream()
                .map(entry -> new LabeledEntry(
                        entry.runName() == null || entry.runName().isEmpty()
                                ? entry.sourceRef()
                                : entry.sourceRef() + " @《" + entry.runName() + "》",
                        entry.reason()))
                .toList(), "越界"));
        return lines;
    }

    /**
     * 附件那一轮单独打。它**不参与退出码判定**：R2 没配置、配额用完都只是降级，
     * 结论那一轮早就写进去了，让附件拖垮整次上报是 §5.6 明确否掉的（同第二期 D9）。
     */
    public static List<String> formatAttachmentLines(AttachmentOutcome outcome) {
        // 一个附件都没排队时整节静默：多打一行「已登记 0 个」只会让对账单更难扫。
        // 但 storageConfigured=false 是**发生了一件事**——presign 明确说了存储没配，
        // 这一轮附件全被跳过；这时哪怕 uploaded 与 rejections 都是空的也必须打出来，
        // 否则用户排了附件却什么反馈都看不到，与「附件传上去了」无法区分。
        if (outcome.storageConfigured() && outcome.uploaded() == 0 && outcome.rejections().isEmpty()) {
            return List.of();
        }
        List<String> lines = new ArrayList<>();
        if (outcome.storageConfigured()) {
            lines.add("附件 已登记 " + outcome.registered() + " 个（上传 " + outcome.uploaded() + " 个）");
        } else {
            lines.add("附件 存储未配置，本轮附件全部跳过；结论已正常写入");
        }
        // 逐条打，不聚合成「N 个失败」：附件被拒的理由各不相同（配额、待评审、
        // 用例不存在），聚合之后人不知道该去解决哪一个。
        for (String reason : outcome.rejections()) {
            lines.add("附件 被拒：" + reason);
        }
        return lines;
    }

    /**
     * 默认 sink：走 stdout 而不是 java.util.logging / SLF4J。
     *
     * <p>对账单不是日志，它是这次上报的**结果**，不该被用户的 logging 配置（级别、
     * appender、格式）改掉一个字，更不该因为「测试阶段把 root logger 关了」而整个消失。
     * 而且引 SLF4J 就等于给「零运行时依赖」开口子。
     *
     * <p>显式指定 UTF-8：对账单里全是中文，CI 上 {@code file.encoding} 常常还是
     * 平台默认值，不指定的话打出来是一堆问号。
     */
    public static final ReceiptSink DEFAULT_SINK = new ReceiptSink() {
        private final PrintStream out = new PrintStream(System.out, true, StandardCharsets.UTF_8);

        @Override
        public void accept(String line) {
            out.println(line);
        }
    };

    public static void printReceipt(
            IngestExecutionReceipt receipt, AttachmentOutcome attachments, ReceiptSink sink) {
        ReceiptSink target = sink == null ? DEFAULT_SINK : sink;
        for (String line : formatReceiptLines(receipt)) {
            target.accept(line);
        }
        if (attachments != null) {
            for (String line : formatAttachmentLines(attachments)) {
                target.accept(line);
            }
        }
    }
}

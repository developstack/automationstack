package org.automationstack.sdk;

import java.io.PrintStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public final class ReceiptPrinter {

    private static final int[][] WIDE_RANGES = {
        {0x1100, 0x115F}, {0x2E80, 0x4DBF}, {0x4E00, 0x9FFF}, {0xAC00, 0xD7A3},
        {0xF900, 0xFAFF}, {0xFE30, 0xFE4F}, {0xFF00, 0xFF60}, {0xFFE0, 0xFFE6},
    };

    private ReceiptPrinter() {
    }

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

    public static List<String> formatAttachmentLines(AttachmentOutcome outcome) {
        if (outcome.storageConfigured() && outcome.uploaded() == 0 && outcome.rejections().isEmpty()) {
            return List.of();
        }
        List<String> lines = new ArrayList<>();
        if (outcome.storageConfigured()) {
            lines.add("附件 已登记 " + outcome.registered() + " 个（上传 " + outcome.uploaded() + " 个）");
        } else {
            lines.add("附件 存储未配置，本轮附件全部跳过；结论已正常写入");
        }
        for (String reason : outcome.rejections()) {
            lines.add("附件 被拒：" + reason);
        }
        return lines;
    }

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

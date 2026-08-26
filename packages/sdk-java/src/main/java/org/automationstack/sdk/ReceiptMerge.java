package org.automationstack.sdk;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 多批的对账单合成一份给人看。
 *
 * <p>分批是 SDK 的实现细节，人关心的是「这一轮结果扩散到了哪些任务」（D34）。
 * 按批打印会让同一个任务出现三行、每行一个数字，人得自己做加法——而这正是
 * §7.2 第 3 条要避免的：{@code writtenTo} 是唯一的披露点，它必须一眼能读。
 *
 * <p>⚠️ **只有 {@code writtenTo} 按 runId 合并求和，三类拒绝一律原样拼接、不去重**。
 * 去重会把「同一条 sourceRef 在两个任务各被拒一次」压成一条，那是在丢信息；
 * 「逐条列出、绝不静默丢弃」是沿用 {@code InvalidRunCases} 的既定语义。
 */
public final class ReceiptMerge {

    private ReceiptMerge() {
    }

    public static IngestExecutionReceipt mergeReceipts(List<IngestExecutionReceipt> receipts) {
        List<IngestOutOfScopeEntry> outOfScope = new ArrayList<>();
        List<IngestSkippedManualEntry> skippedManual = new ArrayList<>();
        List<IngestUnmatchedCaseEntry> unmatchedCases = new ArrayList<>();
        // LinkedHashMap：合并之后 writtenTo 的顺序还是服务端第一次提到各任务的顺序。
        // 用 HashMap 的话同一份对账单每次跑打出来的行序都可能变，人一眼看不出「有没有变化」。
        Map<String, IngestWrittenToEntry> writtenTo = new LinkedHashMap<>();
        for (IngestExecutionReceipt receipt : receipts) {
            outOfScope.addAll(receipt.outOfScope());
            skippedManual.addAll(receipt.skippedManual());
            unmatchedCases.addAll(receipt.unmatchedCases());
            for (IngestWrittenToEntry entry : receipt.writtenTo()) {
                IngestWrittenToEntry existing = writtenTo.get(entry.runId());
                int updated = (existing == null ? 0 : existing.updated()) + entry.updated();
                writtenTo.put(entry.runId(),
                        new IngestWrittenToEntry(entry.runId(), entry.runName(), updated));
            }
        }
        return new IngestExecutionReceipt(
                // 多批时 executionId 有多个，取第一批的：它是人回平台查执行记录的入口，
                // 而同一个 run key 派生出的这几行在报告里本来就是相邻的。
                receipts.isEmpty() ? "" : receipts.get(0).executionId(),
                List.copyOf(outOfScope),
                List.copyOf(skippedManual),
                List.copyOf(unmatchedCases),
                List.copyOf(writtenTo.values()));
    }

    /**
     * {@code writtenTo} 为空 = 一条都没写进去。**这是 SDK 唯一据以报错的信号**
     * （§7.2 第 4 条），不看 HTTP 状态码：服务端在这种情况下返回的仍然是 200 加一份
     * 说明详尽的对账单（§5.8——状态码表达「请求本身有没有问题」，对账单表达
     * 「业务上发生了什么」）。
     */
    public static boolean hasNoWrites(IngestExecutionReceipt receipt) {
        return receipt.writtenTo().isEmpty();
    }
}

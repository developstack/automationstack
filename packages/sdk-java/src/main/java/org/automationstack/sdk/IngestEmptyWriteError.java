package org.automationstack.sdk;

import java.util.ArrayList;
import java.util.List;

/**
 * {@code writtenTo} 为空时抛的错（§7.2 第 4 条）。
 *
 * <p>**静默成功是最坏的情况**：QA 以为结果进去了，实际一条都没写。所以这里既抛异常，
 * 又在 {@link ExitSignal} 上留一个进程级的记号——两条通道都堵上：调用方把
 * {@code finish()} 包在 try/catch 里（框架的钩子里异常常常被吞掉）时，
 * 入口处仍然能读到「这一轮失败了」。
 *
 * <p>{@code message} 里**原样带上服务端的每一条拒绝理由，一个字都不概括**：
 * 「一条都没写进去」的原因有好几种（用例不存在、没有未提交任务收它、任务被提交锁掉、
 * 任务还在待评审），SDK 自己编一句「上报失败」会把它们抹平成同一件事，
 * 而人要照着这句话决定是去补 sourceRef 还是去建测试任务。
 *
 * <p>完整对账单挂在 {@link #receipt()} 上，调用方（比如 JUnit 薄壳）拿它去做自己的
 * 判断，不用重新解析一遍消息文本。
 */
public final class IngestEmptyWriteError extends RuntimeException {

    private static final long serialVersionUID = 1L;

    private static final String NO_REASON_FALLBACK =
            "服务端没有给出任何拒绝理由（本轮 results 为空？）——这一句是 SDK 说的，不是服务端说的";

    private final transient IngestExecutionReceipt receipt;

    public IngestEmptyWriteError(IngestExecutionReceipt receipt) {
        super(buildMessage(receipt));
        this.receipt = receipt;
    }

    public IngestExecutionReceipt receipt() {
        return receipt;
    }

    private static String buildMessage(IngestExecutionReceipt receipt) {
        List<String> reasons = new ArrayList<>();
        for (IngestUnmatchedCaseEntry entry : receipt.unmatchedCases()) {
            reasons.add(entry.sourceRef() + "：" + entry.reason());
        }
        for (IngestOutOfScopeEntry entry : receipt.outOfScope()) {
            reasons.add(entry.sourceRef() + "：" + entry.reason());
        }
        for (IngestSkippedManualEntry entry : receipt.skippedManual()) {
            reasons.add(entry.sourceRef() + " @《" + entry.runName() + "》：" + entry.reason());
        }
        String detail = reasons.isEmpty() ? NO_REASON_FALLBACK : String.join("\n  ", reasons);
        return "本轮结果一条都没有写进任何测试任务（writtenTo 为空）。服务端逐条给出的理由：\n  " + detail;
    }
}

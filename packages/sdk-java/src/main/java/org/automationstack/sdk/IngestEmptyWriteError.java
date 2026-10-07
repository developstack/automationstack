package org.automationstack.sdk;

import java.util.ArrayList;
import java.util.List;

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

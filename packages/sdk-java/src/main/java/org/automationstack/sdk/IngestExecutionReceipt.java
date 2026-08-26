package org.automationstack.sdk;

import java.util.List;
import java.util.Map;

/**
 * 对账单。**四个数组各说一件事，任何两个都不能合并**（§5.1.1）。
 *
 * <p>合并任意两个都会丢信息：「用例不存在」要人去补 sourceRef，「不在任何未提交任务
 * 范围内」要人去建测试任务，「被人工结果挡下」要人去决定要不要 overwriteManual——
 * 三件事的下一步动作完全不同，糊成一句「上报失败」等于什么都没说（§7.2 第 4 条）。
 *
 * <p>ingest 线上契约的**类型副本**，理由见 {@link RoutePaths} 顶部。
 */
public record IngestExecutionReceipt(
        String executionId,
        List<IngestOutOfScopeEntry> outOfScope,
        List<IngestSkippedManualEntry> skippedManual,
        List<IngestUnmatchedCaseEntry> unmatchedCases,
        List<IngestWrittenToEntry> writtenTo) {

    /**
     * 从解析出来的裸 Map 造一份对账单。
     *
     * <p>四个数组各自缺失时都退化成空列表：一轮里任何一类为空都完全正常，
     * 为它抛异常只会让一次成功的上报炸在解析这一步。但每个**条目内部**的必填字段
     * 缺了仍然抛——那说明契约真的漂了。
     */
    public static IngestExecutionReceipt fromWire(Map<String, Object> raw) {
        return new IngestExecutionReceipt(
                Wire.stringOrEmpty(raw, "executionId"),
                Wire.objectList(raw, "outOfScope").stream()
                        .map(IngestOutOfScopeEntry::fromWire).toList(),
                Wire.objectList(raw, "skippedManual").stream()
                        .map(IngestSkippedManualEntry::fromWire).toList(),
                Wire.objectList(raw, "unmatchedCases").stream()
                        .map(IngestUnmatchedCaseEntry::fromWire).toList(),
                Wire.objectList(raw, "writtenTo").stream()
                        .map(IngestWrittenToEntry::fromWire).toList());
    }
}

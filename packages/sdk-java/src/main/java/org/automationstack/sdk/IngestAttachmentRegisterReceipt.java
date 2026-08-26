package org.automationstack.sdk;

import java.util.List;
import java.util.Map;

/**
 * register 的对账单。
 *
 * <p>{@code registered} 那个数组本包只关心**条数**（打印时说「已登记 N 个」），
 * 逐条的 attachmentId 是给平台自己用的，SDK 拿着没有用处——所以这里只留计数，
 * 不复刻一份用不上的记录类型。
 */
public record IngestAttachmentRegisterReceipt(
        int registeredCount, List<IngestAttachmentRegisterRejection> rejected, boolean storageConfigured) {

    public static IngestAttachmentRegisterReceipt fromWire(Map<String, Object> raw) {
        return new IngestAttachmentRegisterReceipt(
                Wire.objectList(raw, "registered").size(),
                Wire.objectList(raw, "rejected").stream()
                        .map(IngestAttachmentRegisterRejection::fromWire).toList(),
                Wire.boolOrDefault(raw, "storageConfigured", false));
    }
}

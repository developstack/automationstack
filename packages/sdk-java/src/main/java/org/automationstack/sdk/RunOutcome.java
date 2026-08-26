package org.automationstack.sdk;

/**
 * {@code finish()} 的返回值。
 *
 * @param attachments 本轮没有附件时为 null。附件的成败**不影响**退出码（§5.6）。
 */
public record RunOutcome(AttachmentOutcome attachments, IngestExecutionReceipt receipt) {
}

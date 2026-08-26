package org.automationstack.sdk;

/** 读盘/取字节之后的样子。{@link AttachmentUpload} 只认这个，不碰文件系统语义。 */
public record LoadedAttachment(
        byte[] body,
        String contentType,
        String fileName,
        AttachmentKind kind,
        long sizeBytes,
        String sourceRef) {
}

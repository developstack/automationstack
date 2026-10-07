package org.automationstack.sdk;

public record LoadedAttachment(
        byte[] body,
        String contentType,
        String fileName,
        AttachmentKind kind,
        long sizeBytes,
        String sourceRef) {
}

package org.automationstack.sdk;

/** 附件的**本地编程错误**：既没有 body 也没有 filePath。入队那一刻就抛。 */
public final class AttachmentInputError extends RuntimeException {

    private static final long serialVersionUID = 1L;

    public AttachmentInputError(String message) {
        super(message);
    }
}

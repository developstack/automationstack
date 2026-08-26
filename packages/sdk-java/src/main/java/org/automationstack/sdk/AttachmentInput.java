package org.automationstack.sdk;

/**
 * 一个待上传的附件。{@code body} 与 {@code filePath} 二选一，两个都不给会在**入队时**
 * 就报错——那是本地的编程错误，没必要拖到 presign 之后才发现。
 *
 * <p>字段多且大半可缺，所以给了 {@link Builder}；直接调构造器也行。
 */
public record AttachmentInput(
        String sourceRef,
        AttachmentKind kind,
        byte[] body,
        String filePath,
        String contentType,
        String fileName) {

    public static Builder builder(String sourceRef, AttachmentKind kind) {
        return new Builder(sourceRef, kind);
    }

    /** 直接给字节。截图/日志常常本来就在内存里，逼用户先落盘没有道理。 */
    public static AttachmentInput ofBytes(String sourceRef, AttachmentKind kind, byte[] body) {
        return builder(sourceRef, kind).body(body).build();
    }

    public static AttachmentInput ofFile(String sourceRef, AttachmentKind kind, String filePath) {
        return builder(sourceRef, kind).filePath(filePath).build();
    }

    public static final class Builder {
        private final String sourceRef;
        private final AttachmentKind kind;
        private byte[] body;
        private String filePath;
        private String contentType;
        private String fileName;

        private Builder(String sourceRef, AttachmentKind kind) {
            this.sourceRef = sourceRef;
            this.kind = kind;
        }

        public Builder body(byte[] value) {
            this.body = value;
            return this;
        }

        public Builder filePath(String value) {
            this.filePath = value;
            return this;
        }

        /** 不给就按 {@code kind} 或扩展名猜一个；PUT 时必须用 presign 回来的值，不是这个值。 */
        public Builder contentType(String value) {
            this.contentType = value;
            return this;
        }

        /** 不给就取 {@code filePath} 的文件名；两个都没有就用 {@code kind} 兜底。 */
        public Builder fileName(String value) {
            this.fileName = value;
            return this;
        }

        public AttachmentInput build() {
            return new AttachmentInput(sourceRef, kind, body, filePath, contentType, fileName);
        }
    }
}

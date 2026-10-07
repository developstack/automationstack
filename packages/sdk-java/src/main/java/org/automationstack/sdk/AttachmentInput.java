package org.automationstack.sdk;

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

        public Builder contentType(String value) {
            this.contentType = value;
            return this;
        }

        public Builder fileName(String value) {
            this.fileName = value;
            return this;
        }

        public AttachmentInput build() {
            return new AttachmentInput(sourceRef, kind, body, filePath, contentType, fileName);
        }
    }
}

package org.automationstack.sdk;

import java.util.Locale;

/** 与服务端 {@code attachmentKindSchema} 同一份词汇表。 */
public enum AttachmentKind {
    LOG,
    OTHER,
    SCREENSHOT,
    VIDEO;

    public String wire() {
        return name().toLowerCase(Locale.ROOT);
    }
}

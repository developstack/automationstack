package org.automationstack.sdk;

import java.util.Locale;

public enum AttachmentKind {
    LOG,
    OTHER,
    SCREENSHOT,
    VIDEO;

    public String wire() {
        return name().toLowerCase(Locale.ROOT);
    }
}

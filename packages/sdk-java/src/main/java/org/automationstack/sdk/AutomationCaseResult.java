package org.automationstack.sdk;

import java.util.Locale;

public enum AutomationCaseResult {
    BLOCKED,
    FAILED,
    PASSED,
    SKIPPED;

    public String wire() {
        return name().toLowerCase(Locale.ROOT);
    }
}

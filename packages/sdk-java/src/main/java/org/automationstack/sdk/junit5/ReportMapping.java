package org.automationstack.sdk.junit5;

import java.io.PrintWriter;
import java.io.StringWriter;
import org.automationstack.sdk.AutomationCaseResult;

public final class ReportMapping {

    private ReportMapping() {
    }

    public static AutomationCaseResult failedResult(boolean blockedBySetup) {
        return blockedBySetup ? AutomationCaseResult.BLOCKED : AutomationCaseResult.FAILED;
    }

    public static String abortedText(Throwable error) {
        if (error == null) {
            return null;
        }
        String message = error.getMessage();
        return message == null || message.isBlank() ? error.toString() : message.strip();
    }

    public static String failureText(Throwable error) {
        if (error == null) {
            return null;
        }
        StringWriter buffer = new StringWriter();
        try (PrintWriter writer = new PrintWriter(buffer)) {
            error.printStackTrace(writer);
        }
        String text = buffer.toString().strip();
        return text.isEmpty() ? error.toString() : text;
    }
}

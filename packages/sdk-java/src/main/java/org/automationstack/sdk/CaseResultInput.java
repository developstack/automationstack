package org.automationstack.sdk;

public record CaseResultInput(String sourceRef, AutomationCaseResult result, Long durationMs, String message) {

    public CaseResultInput {
        if (sourceRef == null || sourceRef.isEmpty()) {
            throw new IllegalArgumentException("CaseResultInput 需要一个非空的 sourceRef");
        }
        if (result == null) {
            throw new IllegalArgumentException("CaseResultInput 需要一个结论（" + sourceRef + "）");
        }
    }

    public static CaseResultInput of(String sourceRef, AutomationCaseResult result) {
        return new CaseResultInput(sourceRef, result, null, null);
    }

    public static CaseResultInput of(String sourceRef, AutomationCaseResult result, String message) {
        return new CaseResultInput(sourceRef, result, null, message);
    }

    public CaseResultInput withDurationMs(Long value) {
        return new CaseResultInput(sourceRef, result, value, message);
    }

    public CaseResultInput withMessage(String value) {
        return new CaseResultInput(sourceRef, result, durationMs, value);
    }
}

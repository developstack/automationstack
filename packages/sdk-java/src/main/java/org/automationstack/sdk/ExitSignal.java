package org.automationstack.sdk;

public final class ExitSignal {

    private static volatile boolean pendingFailure;

    private ExitSignal() {
    }

    public static void markFailure() {
        pendingFailure = true;
    }

    public static boolean pendingFailure() {
        return pendingFailure;
    }

    public static int exitCode() {
        return pendingFailure ? 1 : 0;
    }

    static void reset() {
        pendingFailure = false;
    }
}

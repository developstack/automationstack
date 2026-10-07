package org.automationstack.sdk.junit5;

import java.lang.reflect.Method;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import org.automationstack.sdk.AttachmentInput;
import org.automationstack.sdk.AttachmentKind;
import org.automationstack.sdk.AutomationCaseResult;
import org.automationstack.sdk.AutomationStackReporter;
import org.automationstack.sdk.CaseResultInput;
import org.automationstack.sdk.ContractLimits;
import org.automationstack.sdk.ReporterConfigError;
import org.junit.jupiter.api.extension.BeforeAllCallback;
import org.junit.jupiter.api.extension.ExtensionContext;
import org.junit.jupiter.api.extension.LifecycleMethodExecutionExceptionHandler;
import org.junit.jupiter.api.extension.TestWatcher;

public final class AutomationStackExtension
        implements BeforeAllCallback, LifecycleMethodExecutionExceptionHandler, TestWatcher {

    public static final String ENABLED_PROPERTY = "automationstack.enabled";

    private static final ExtensionContext.Namespace NAMESPACE =
            ExtensionContext.Namespace.create(AutomationStackExtension.class);

    private static final String SESSION_KEY = "session";

    @Override
    public void beforeAll(ExtensionContext context) {
        session(context);
    }

    @Override
    public void handleBeforeEachMethodExecutionException(
            ExtensionContext context, Throwable throwable) throws Throwable {
        session(context).blockedBySetup.add(context.getUniqueId());
        throw throwable;
    }

    @Override
    public void handleBeforeAllMethodExecutionException(
            ExtensionContext context, Throwable throwable) throws Throwable {
        session(context).blockedBySetup.add(context.getUniqueId());
        throw throwable;
    }

    @Override
    public void handleAfterEachMethodExecutionException(
            ExtensionContext context, Throwable throwable) throws Throwable {
        throw throwable;
    }

    @Override
    public void testSuccessful(ExtensionContext context) {
        record(context, AutomationCaseResult.PASSED, null);
    }

    @Override
    public void testFailed(ExtensionContext context, Throwable cause) {
        Session session = session(context);
        boolean blocked = session.blockedBySetup.contains(context.getUniqueId())
                || parentBlocked(session, context);
        record(context, ReportMapping.failedResult(blocked), ReportMapping.failureText(cause));
    }

    @Override
    public void testAborted(ExtensionContext context, Throwable cause) {
        record(context, AutomationCaseResult.SKIPPED, ReportMapping.abortedText(cause));
    }

    @Override
    public void testDisabled(ExtensionContext context, Optional<String> reason) {
        record(context, AutomationCaseResult.SKIPPED, reason.orElse(null));
    }

    private static boolean parentBlocked(Session session, ExtensionContext context) {
        Optional<ExtensionContext> parent = context.getParent();
        while (parent.isPresent()) {
            if (session.blockedBySetup.contains(parent.get().getUniqueId())) {
                return true;
            }
            parent = parent.get().getParent();
        }
        return false;
    }

    private void record(ExtensionContext context, AutomationCaseResult result, String message) {
        Session session = session(context);
        String sourceRef = sourceRef(context);
        if (sourceRef == null) {
            session.unmarked++;
            return;
        }
        if (session.reporter == null) {
            return;
        }
        session.reporter.addResult(new CaseResultInput(sourceRef, result, null, message));
        if (message != null && message.length() > ContractLimits.MAX_INGEST_COMMENT_LENGTH) {
            session.reporter.addAttachment(AttachmentInput.ofBytes(
                    sourceRef, AttachmentKind.LOG, message.getBytes(StandardCharsets.UTF_8)));
        }
    }

    private static String sourceRef(ExtensionContext context) {
        return sourceRefOf(context.getTestMethod().orElse(null), context.getTestClass().orElse(null));
    }

    static String sourceRefOf(Method method, Class<?> testClass) {
        if (method != null) {
            AutomationStack onMethod = method.getAnnotation(AutomationStack.class);
            if (onMethod != null) {
                return onMethod.value();
            }
        }
        if (testClass != null) {
            AutomationStack onClass = testClass.getAnnotation(AutomationStack.class);
            if (onClass != null) {
                return onClass.value();
            }
        }
        return null;
    }

    private static Session session(ExtensionContext context) {
        return context.getRoot()
                .getStore(NAMESPACE)
                .getOrComputeIfAbsent(SESSION_KEY, key -> new Session(), Session.class);
    }

    static final class Session implements ExtensionContext.Store.CloseableResource {

        final Set<String> blockedBySetup = ConcurrentHashMap.newKeySet();
        final List<String> notes = new ArrayList<>();
        final AutomationStackReporter reporter;
        int unmarked;

        Session() {
            this.reporter = createReporter(notes);
        }

        @Override
        public void close() {
            for (String note : notes) {
                System.out.println(note);
            }
            if (unmarked > 0) {
                System.out.println(
                        "automationstack：有 " + unmarked + " 条用例没标 @AutomationStack，未上报");
            }
            if (reporter == null) {
                return;
            }
            if (reporter.pendingResultCount() == 0) {
                System.out.println("automationstack：这一轮没有已标注的用例结果，未上报");
                return;
            }
            reporter.finish();
        }

        private static AutomationStackReporter createReporter(List<String> notes) {
            if ("false".equalsIgnoreCase(System.getProperty(ENABLED_PROPERTY))) {
                notes.add("automationstack：已被 -D" + ENABLED_PROPERTY + "=false 关闭，未上报");
                return null;
            }
            try {
                return AutomationStackReporter.builder().markExitSignal(false).build();
            } catch (ReporterConfigError error) {
                notes.add("automationstack：未上报（" + error.getMessage() + "）");
                return null;
            }
        }
    }
}

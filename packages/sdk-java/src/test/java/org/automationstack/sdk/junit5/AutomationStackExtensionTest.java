package org.automationstack.sdk.junit5;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.lang.annotation.ElementType;
import java.lang.annotation.Inherited;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;
import java.lang.reflect.Method;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.BeforeAllCallback;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.extension.LifecycleMethodExecutionExceptionHandler;
import org.junit.jupiter.api.extension.TestWatcher;

class AutomationStackExtensionTest {

    @AutomationStack("CLASS-LEVEL")
    static class Annotated {

        @AutomationStack("METHOD-LEVEL")
        void withOwnRef() {
        }

        void inheritsFromClass() {
        }
    }

    static class InheritsAnnotatedParent extends Annotated {
    }

    static class Bare {

        void nothing() {
        }
    }

    private static Method method(Class<?> owner, String name) throws Exception {
        return owner.getDeclaredMethod(name);
    }

    @Test
    void methodAnnotationWinsOverClassAnnotation() throws Exception {
        assertEquals("METHOD-LEVEL", AutomationStackExtension.sourceRefOf(
                method(Annotated.class, "withOwnRef"), Annotated.class));
    }

    @Test
    void fallsBackToTheClassAnnotation() throws Exception {
        assertEquals("CLASS-LEVEL", AutomationStackExtension.sourceRefOf(
                method(Annotated.class, "inheritsFromClass"), Annotated.class));
    }

    @Test
    void classAnnotationIsInherited() {
        assertEquals("CLASS-LEVEL",
                AutomationStackExtension.sourceRefOf(null, InheritsAnnotatedParent.class));
    }

    @Test
    void unannotatedTestsAreNotReported() throws Exception {
        assertNull(AutomationStackExtension.sourceRefOf(method(Bare.class, "nothing"), Bare.class));
        assertNull(AutomationStackExtension.sourceRefOf(null, null));
    }

    @Test
    void annotationIsRuntimeVisibleOnMethodsAndTypes() {
        assertEquals(RetentionPolicy.RUNTIME,
                AutomationStack.class.getAnnotation(Retention.class).value());
        assertTrue(AutomationStack.class.isAnnotationPresent(Inherited.class));
        List<ElementType> targets =
                List.of(AutomationStack.class.getAnnotation(Target.class).value());
        assertTrue(targets.contains(ElementType.METHOD));
        assertTrue(targets.contains(ElementType.TYPE));
    }

    @Test
    void theExtensionIsOptInOnly() {
        assertFalse(AutomationStackExtension.class.isAnnotationPresent(ExtendWith.class));
        assertTrue(TestWatcher.class.isAssignableFrom(AutomationStackExtension.class));
        assertTrue(BeforeAllCallback.class.isAssignableFrom(AutomationStackExtension.class));
        assertTrue(LifecycleMethodExecutionExceptionHandler.class
                .isAssignableFrom(AutomationStackExtension.class));
    }

    @Test
    void allBusinessLogicStaysInTheCore() throws Exception {
        Path shell = Path.of("src", "main", "java", "org", "automationstack", "sdk", "junit5");
        try (Stream<Path> files = Files.walk(shell)) {
            for (Path file : files.filter(path -> path.toString().endsWith(".java")).toList()) {
                String code = org.automationstack.sdk.SourceScan.stripComments(Files.readString(file));
                assertFalse(code.contains("HttpRequest"), file + " 里出现了 HTTP");
                assertFalse(code.contains("Idempotency."), file + " 里出现了幂等键计算");
                assertFalse(code.contains("ReceiptPrinter"), file + " 里出现了对账单渲染");
                assertFalse(code.contains("ExecutionBatches"), file + " 里出现了分批");
                assertFalse(code.contains("ExitSignal."), file + " 不该碰进程级退出记号");
            }
        }
    }
}

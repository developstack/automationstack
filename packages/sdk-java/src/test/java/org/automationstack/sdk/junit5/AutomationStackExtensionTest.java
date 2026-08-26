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

/**
 * 薄壳的行为。这里刻意**不去起一个嵌套的 JUnit 测试计划**：那要引
 * {@code junit-platform-testkit}，为了验二十行搬运代码多一个依赖不划算，
 * 而这二十行里真正会错的只有「注解怎么找」和「业务逻辑有没有漏进来」。
 */
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
        // 一个类里大多数用例属于同一条时，类上标一次就够。
        assertEquals("CLASS-LEVEL", AutomationStackExtension.sourceRefOf(
                method(Annotated.class, "inheritsFromClass"), Annotated.class));
    }

    @Test
    void classAnnotationIsInherited() {
        // 共用基类的测试类因此不用每个都标一遍。
        assertEquals("CLASS-LEVEL",
                AutomationStackExtension.sourceRefOf(null, InheritsAnnotatedParent.class));
    }

    @Test
    void unannotatedTestsAreNotReported() throws Exception {
        // 整批发过去只会让它们挤满对账单的「未匹配」，把真正该看的那几条淹掉。
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
        // JUnit 没有自动注册这回事：不写 @ExtendWith，这个类连加载都不会加载。
        // 这正是它不必像 pytest 插件那样拆成独立发行包的原因。
        assertFalse(AutomationStackExtension.class.isAnnotationPresent(ExtendWith.class));
        assertTrue(TestWatcher.class.isAssignableFrom(AutomationStackExtension.class));
        assertTrue(BeforeAllCallback.class.isAssignableFrom(AutomationStackExtension.class));
        // setup 失败要能与断言失败分开，靠的就是这个接口。
        assertTrue(LifecycleMethodExecutionExceptionHandler.class
                .isAssignableFrom(AutomationStackExtension.class));
    }

    @Test
    void allBusinessLogicStaysInTheCore() throws Exception {
        // 薄壳只做注册与收集：分批、幂等、重试、对账单渲染一行都不该在这里。
        // 换成 TestNG 的壳时要重写的只有这个包。
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

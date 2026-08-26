package org.automationstack.sdk;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.lang.reflect.Method;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.stream.Stream;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

/**
 * 退出码那条铁律（§7.2 第 4 条）在 Java 上的落法。
 *
 * <p>Python 那边这件事是靠起一个子进程验 {@code returncode} 的。Java 里起一个 JVM
 * 只为了看退出码，代价是几秒钟和一份 classpath 的拼装——这里换成两条更直接的断言：
 * 记号本身的行为，以及**库里一行 System.exit 都没有**。后者才是真正要守住的东西：
 * 库里调 exit 会把宿主的测试框架整个掐掉（见 {@link ExitSignal} 的长注释）。
 */
class ExitSignalTest {

    @AfterEach
    void clear() {
        ExitSignal.reset();
    }

    @Test
    void defaultsToZero() {
        assertEquals(0, ExitSignal.exitCode());
        assertFalse(ExitSignal.pendingFailure());
    }

    @Test
    void markFailureIsStickyAndProcessWide() {
        ExitSignal.markFailure();
        assertTrue(ExitSignal.pendingFailure());
        assertEquals(1, ExitSignal.exitCode());
        // 一个进程里建两个 reporter 时，任何一个失败都该让整个进程判失败。
        ExitSignal.markFailure();
        assertEquals(1, ExitSignal.exitCode());
    }

    @Test
    void markFailureDoesNotInterruptAnything() {
        // 它只是写一个 boolean：调用它之后这一行必须还能跑到。
        ExitSignal.markFailure();
        assertTrue(true, "markFailure 之后代码继续执行");
    }

    @Test
    void librarySourceNeverCallsSystemExitOrHalt() throws Exception {
        try (Stream<Path> files = Files.walk(Path.of("src", "main", "java"))) {
            for (Path file : files.filter(path -> path.toString().endsWith(".java")).toList()) {
                String code = SourceScan.stripComments(Files.readString(file));
                assertFalse(code.contains("System.exit("),
                        file + " 里调了 System.exit()，那会把宿主的测试框架整个掐掉");
                assertFalse(code.contains("Runtime.getRuntime().halt("), file + " 里调了 halt()");
                assertFalse(code.contains("addShutdownHook("),
                        file + " 里注册了关闭钩子——退出由入口负责，不是库");
            }
        }
    }

    @Test
    void exitCodeIsPublicSoEntryPointsCanUseIt() throws Exception {
        // examples/ 里的 main 就靠这个方法收尾。
        Method method = ExitSignal.class.getMethod("exitCode");
        assertEquals(int.class, method.getReturnType());
    }
}

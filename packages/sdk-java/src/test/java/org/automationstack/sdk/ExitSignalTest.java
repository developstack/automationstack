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
        ExitSignal.markFailure();
        assertEquals(1, ExitSignal.exitCode());
    }

    @Test
    void markFailureDoesNotInterruptAnything() {
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
        Method method = ExitSignal.class.getMethod("exitCode");
        assertEquals(int.class, method.getReturnType());
    }
}

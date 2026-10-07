package org.automationstack.sdk;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;

class NoPreflightTest {

    private static final Path MAIN = Path.of("src", "main", "java");

    private static List<Path> mainSources() throws Exception {
        try (Stream<Path> files = Files.walk(MAIN)) {
            return files.filter(path -> path.toString().endsWith(".java")).sorted().toList();
        }
    }

    @Test
    void theRouteIsDeclaredButNeverUsed() throws Exception {
        List<String> offenders = new ArrayList<>();
        for (Path file : mainSources()) {
            if (file.getFileName().toString().equals("RoutePaths.java")) {
                continue;
            }
            String code = SourceScan.stripComments(Files.readString(file));
            if (code.contains("INGEST_RUNS_ROUTE") || code.contains("/ingest/runs")) {
                offenders.add(file.toString());
            }
        }
        assertEquals(List.of(), offenders, "这些文件碰了 GET /ingest/runs（§7.2 第 5 条）");
    }

    @Test
    void theRouteConstantStillExistsForHumans() {
        assertEquals("/ingest/runs", RoutePaths.INGEST_RUNS_ROUTE);
    }

    @Test
    void onlyThreeRoutesAreEverCalled() throws Exception {
        List<String> called = new ArrayList<>();
        for (Path file : mainSources()) {
            String code = SourceScan.stripComments(Files.readString(file));
            for (String route : List.of("INGEST_EXECUTIONS_ROUTE",
                    "INGEST_ATTACHMENTS_PRESIGN_ROUTE", "INGEST_ATTACHMENTS_REGISTER_ROUTE")) {
                if (code.contains("RoutePaths." + route) && !called.contains(route)) {
                    called.add(route);
                }
            }
        }
        assertEquals(3, called.size(), "正常路径上只有这三条路由");
    }

    @Test
    void hasZeroRuntimeDependencies() throws Exception {
        String pom = Files.readString(Path.of("pom.xml")).replaceAll("(?s)<!--.*?-->", "");
        String dependencies = pom.substring(
                pom.indexOf("<dependencies>"), pom.indexOf("</dependencies>"))
                .toLowerCase(java.util.Locale.ROOT);
        assertFalse(dependencies.contains("jackson"), "引 Jackson 就等于跟用户的版本打架");
        assertFalse(dependencies.contains("gson"));
        assertFalse(dependencies.contains("slf4j"));
        assertFalse(dependencies.contains("okhttp"));
        assertFalse(dependencies.contains("aws-sdk"), "预签名 URL 就是一次普通的 PUT");
        int compileScoped = dependencies.split("<dependency>", -1).length - 1
                - (dependencies.split("<scope>", -1).length - 1);
        assertEquals(0, compileScoped, "每一个依赖都必须显式声明 provided 或 test 作用域");
    }

    @Test
    void importsOnlyJdkPackages() throws Exception {
        for (Path file : mainSources()) {
            for (String line : Files.readAllLines(file)) {
                if (!line.startsWith("import ")) {
                    continue;
                }
                String imported = line.substring("import ".length());
                assertTrue(imported.startsWith("java.") || imported.startsWith("javax.")
                                || imported.startsWith("org.automationstack.")
                                || imported.startsWith("org.junit."),
                        file + " 引了非 JDK 的包：" + line);
                if (imported.startsWith("org.junit.")) {
                    assertTrue(file.toString().contains("junit5"),
                            file + " 不该认识 JUnit——核心包是框架无关的");
                }
            }
        }
    }
}

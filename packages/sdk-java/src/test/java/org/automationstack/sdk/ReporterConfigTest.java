package org.automationstack.sdk;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

/** 配置只有 token + projectId + baseUrl 三样（D31），而且缺一样就立刻炸。 */
class ReporterConfigTest {

    private static Map<String, String> fullEnv() {
        return Map.of(
                "AS_TOKEN", TestFixtures.TOKEN,
                "AS_PROJECT", TestFixtures.PROJECT_ID,
                "AS_BASE_URL", TestFixtures.BASE_URL);
    }

    @Test
    void readsTheThreeRequiredValuesFromEnv() {
        ReporterConfig config = ReporterConfig.resolve(new ReporterConfigInput().env(fullEnv()));
        assertEquals(TestFixtures.TOKEN, config.token());
        assertEquals(TestFixtures.PROJECT_ID, config.projectId());
        assertEquals(TestFixtures.BASE_URL, config.baseUrl());
        // runIds 不是环境变量，否则它就变成了每迭代要维护的东西（D31）。
        assertNull(config.runIds());
        assertFalse(config.overwriteManual());
    }

    @Test
    void explicitValuesWinOverEnv() {
        ReporterConfig config = ReporterConfig.resolve(new ReporterConfigInput()
                .env(fullEnv())
                .projectId("99999999-2222-4333-8444-555555555555")
                .runIds(List.of("run-1")));
        assertEquals("99999999-2222-4333-8444-555555555555", config.projectId());
        assertEquals(List.of("run-1"), config.runIds());
    }

    @Test
    void stripsTrailingSlashesFromBaseUrl() {
        // 不削的话拼出 //ingest/...，有的反代会 301，而 301 之后 Authorization
        // 按规范可以被丢掉——表现是莫名其妙的 401。
        ReporterConfig config = ReporterConfig.resolve(
                new ReporterConfigInput().env(fullEnv()).baseUrl("https://qa.example.com///"));
        assertEquals("https://qa.example.com", config.baseUrl());
    }

    @Test
    void readsOptionalCiMetadata() {
        ReporterConfig config = ReporterConfig.resolve(new ReporterConfigInput().env(Map.of(
                "AS_TOKEN", TestFixtures.TOKEN,
                "AS_PROJECT", TestFixtures.PROJECT_ID,
                "AS_BASE_URL", TestFixtures.BASE_URL,
                "AS_BRANCH", "main",
                "AS_CI_URL", "https://ci.example.com/run/1",
                "AS_COMMIT_SHA", "0123456789abcdef")));
        assertEquals("main", config.branch());
        assertEquals("https://ci.example.com/run/1", config.ciUrl());
        assertEquals("0123456789abcdef", config.commitSha());
    }

    @Test
    void failsFastWithAnActionableMessageWhenTokenIsMissing() {
        ReporterConfigError error = assertThrows(ReporterConfigError.class,
                () -> ReporterConfig.resolve(new ReporterConfigInput().env(Map.of(
                        "AS_PROJECT", TestFixtures.PROJECT_ID,
                        "AS_BASE_URL", TestFixtures.BASE_URL))));
        // 消息里必须写清楚去哪建 token，不能只说「缺少配置」。
        assertTrue(error.getMessage().contains("AS_TOKEN"));
        assertTrue(error.getMessage().contains("api-tokens"));
    }

    @Test
    void failsFastWhenProjectOrBaseUrlIsMissing() {
        assertTrue(assertThrows(ReporterConfigError.class,
                () -> ReporterConfig.resolve(new ReporterConfigInput().env(Map.of(
                        "AS_TOKEN", TestFixtures.TOKEN,
                        "AS_BASE_URL", TestFixtures.BASE_URL))))
                .getMessage().contains("AS_PROJECT"));
        assertTrue(assertThrows(ReporterConfigError.class,
                () -> ReporterConfig.resolve(new ReporterConfigInput().env(Map.of(
                        "AS_TOKEN", TestFixtures.TOKEN,
                        "AS_PROJECT", TestFixtures.PROJECT_ID))))
                .getMessage().contains("AS_BASE_URL"));
    }

    @Test
    void blankEnvValueCountsAsMissing() {
        assertThrows(ReporterConfigError.class,
                () -> ReporterConfig.resolve(new ReporterConfigInput().env(Map.of(
                        "AS_TOKEN", "   ",
                        "AS_PROJECT", TestFixtures.PROJECT_ID,
                        "AS_BASE_URL", TestFixtures.BASE_URL))));
    }

    @Test
    void generatesRunIdempotencyKeyWhenNotConfigured() {
        ReporterConfig config = ReporterConfig.resolve(new ReporterConfigInput().env(fullEnv()));
        assertEquals(36, config.idempotencyKey().length());
    }

    @Test
    void hasNoSingularRunIdField() {
        // 服务端把单数 runId 声明成了 z.never()，发过去是一条 400（D31）。
        // 这里连字段都不该有——用反射盯住它，加回来时立刻红。
        for (var component : ReporterConfig.class.getRecordComponents()) {
            assertFalse("runId".equals(component.getName()),
                    "ReporterConfig 不该有单数的 runId");
        }
    }
}

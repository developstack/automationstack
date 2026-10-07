package org.automationstack.sdk;

import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

public record ReporterConfig(
        String baseUrl,
        String branch,
        String ciUrl,
        String commitSha,
        String idempotencyKey,
        boolean overwriteManual,
        String projectId,
        List<String> runIds,
        String token) {

    private static final Pattern TRAILING_SLASHES = Pattern.compile("/+$");

    private static final String MISSING_TOKEN =
            "缺少 AS_TOKEN：在 https://<你的平台地址>/api-tokens 建一个个人 token，明文只显示一次";
    private static final String MISSING_PROJECT =
            "缺少 AS_PROJECT：填这个仓库对应的项目 id（跟着仓库走，建一次不再变）";
    private static final String MISSING_BASE_URL =
            "缺少 AS_BASE_URL：填平台地址，例如 https://qa.example.com";

    public static ReporterConfig resolve(ReporterConfigInput input) {
        Map<String, String> env = input.env() == null ? System.getenv() : input.env();
        return new ReporterConfig(
                TRAILING_SLASHES.matcher(
                        requireValue(input.baseUrl(), env.get("AS_BASE_URL"), MISSING_BASE_URL))
                        .replaceAll(""),
                firstPresent(input.branch(), env.get("AS_BRANCH")),
                firstPresent(input.ciUrl(), env.get("AS_CI_URL")),
                firstPresent(input.commitSha(), env.get("AS_COMMIT_SHA")),
                input.idempotencyKey() != null && !input.idempotencyKey().isBlank()
                        ? input.idempotencyKey()
                        : Idempotency.resolveRunIdempotencyKey(env),
                input.overwriteManual(),
                requireValue(input.projectId(), env.get("AS_PROJECT"), MISSING_PROJECT),
                input.runIds(),
                requireValue(input.token(), env.get("AS_TOKEN"), MISSING_TOKEN));
    }

    private static String trimmedOrNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    private static String firstPresent(String explicit, String fromEnv) {
        String value = trimmedOrNull(explicit);
        return value != null ? value : trimmedOrNull(fromEnv);
    }

    private static String requireValue(String explicit, String fromEnv, String missingMessage) {
        String value = firstPresent(explicit, fromEnv);
        if (value == null) {
            throw new ReporterConfigError(missingMessage);
        }
        return value;
    }
}

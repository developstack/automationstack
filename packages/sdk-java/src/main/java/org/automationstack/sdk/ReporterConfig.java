package org.automationstack.sdk;

import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * SDK 配置（§5.1 / D31）。
 *
 * <p>**只有 token + projectId + baseUrl 三样，没有第四样**，而且三样全都跨迭代不变。
 * 尤其**没有 {@code runId}**：每个迭代一个新测试任务，配置里写死 runId 意味着每个迭代
 * 都要有人去改 CI 变量，这种手动步骤第一次会忘、第二次就没人用了；
 * 归属由用例的 sourceRef 自己解析（§3.7）。
 *
 * <p>{@code runIds}（复数）是**每次调用可以传的收窄白名单**，刻意不放进环境变量：
 * 放进配置文件它就变成了每迭代要维护的东西，D31 立刻作废。
 *
 * <p>⚠️ 环境变量名与 Node / Python 两家**逐字一致**（{@code AS_} 前缀那七个）。
 * 同一个仓库里 Java 与 Node 的脚本常常共用一份 CI 环境，改名就等于让人维护两套 secret，
 * 而两套里总有一套会过期。
 *
 * @param idempotencyKey 一次进程一个，重试复用（§7.2 第 2 条）。
 * @param runIds         null = 全部候选。见上面为什么它不是环境变量。
 */
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

    /** 顶层定义：这个正则每次解析配置都会用到，没必要每次重建一个。 */
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
                // 末尾斜杠在这里一次性削掉：不削的话 baseUrl + "/ingest/executions"
                // 会拼出 `//ingest/...`，有的反代会把它 301 到别处，而 301 之后
                // Authorization 头按规范是可以被丢掉的——表现就是莫名其妙的 401。
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

    /**
     * 显式参数 &gt; 环境变量。显式参数是给「把配置写在自己的 base class 里」的人留的，
     * 环境变量是给 CI 留的；两者都在时以代码里写的为准，否则同一份配置在本机和 CI 上
     * 表现不同，那是最难查的一类问题。
     *
     * <p>缺了就**立刻抛**：缺 token 这种事必须在跑测试之前炸，而不是等跑完二十分钟
     * 才发现结果无处可去。
     */
    private static String requireValue(String explicit, String fromEnv, String missingMessage) {
        String value = firstPresent(explicit, fromEnv);
        if (value == null) {
            throw new ReporterConfigError(missingMessage);
        }
        return value;
    }
}

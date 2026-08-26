package org.automationstack.sdk;

import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;

/**
 * 把攒了一整轮的结果切成若干个请求体（§7.2 第 1 条「缓冲后批量提交」）。
 *
 * <p>**不逐条发**：{@code ensureRunWritable} 对 {@code test_runs} 行加 {@code FOR UPDATE}，
 * 逐条上报就是逐条开事务抢同一把行锁，80 条就是 80 次串行往返；QA 本机的网络还不稳，
 * 跑一条报一条既慢又碎（§5.5 / D29）。
 */
public final class ExecutionBatches {

    private static final String TRUNCATION_SUFFIX = "…（已截断，完整堆栈见 log 附件）";

    /**
     * 与 Node 版的 {@code Date#toISOString()} **逐字符**一致：UTC、固定三位毫秒、结尾 Z。
     *
     * <p>没有用 {@link Instant#toString()}：那个方法在毫秒为 0 时会把小数部分整个省掉
     * （{@code 2026-08-25T10:00:00Z}），在纳秒非零时又会打到九位。服务端两种都收，
     * 但三家 SDK 打出来的字节不一致时，抓包比对就没法做了。
     */
    private static final DateTimeFormatter ISO_MILLIS =
            DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'").withZone(ZoneOffset.UTC);

    private ExecutionBatches() {
    }

    /**
     * 截断在 SDK 侧先做一次（§5.1.1 明确写了「SDK 侧负责」）。
     *
     * <p>尾巴上留一句话说明被截了：不留的话，人在失败清单上看到的是一句戛然而止的
     * 堆栈，会以为是脚本自己输出成那样的。
     *
     * <p>长度按 {@link String#length()}（UTF-16 码元）算，与 Node 版的 {@code .length}
     * 一致。劈开一对代理项是可能的，{@link Json} 的编码侧会把落单的那个转义掉，
     * 不会产生非法 UTF-8。
     */
    public static String truncateMessage(String message) {
        if (message == null || message.isEmpty()) {
            return null;
        }
        if (message.length() <= ContractLimits.MAX_INGEST_COMMENT_LENGTH) {
            return message;
        }
        int keep = ContractLimits.MAX_INGEST_COMMENT_LENGTH - TRUNCATION_SUFFIX.length();
        return message.substring(0, keep) + TRUNCATION_SUFFIX;
    }

    public static List<List<CaseResultInput>> chunkResults(List<CaseResultInput> results) {
        return chunkResults(results, ContractLimits.RESULTS_PER_BATCH);
    }

    public static List<List<CaseResultInput>> chunkResults(List<CaseResultInput> results, int batchSize) {
        List<List<CaseResultInput>> batches = new ArrayList<>();
        if (results.isEmpty()) {
            // 空数组仍然要发一批：一次「过滤条件没匹配上任何用例」的执行照样该留下
            // 执行记录，而且 `writtenTo` 为空这件事必须由服务端的对账单说出来
            // （§7.2 第 4 条要透传的正是它的理由），SDK 自己短路掉就没有理由可透传。
            batches.add(List.of());
            return batches;
        }
        for (int start = 0; start < results.size(); start += batchSize) {
            batches.add(List.copyOf(results.subList(start, Math.min(start + batchSize, results.size()))));
        }
        return batches;
    }

    /**
     * ⚠️ **每批一个不同的幂等键，但每个键都从同一个 run key 确定性派生**。
     *
     * <p>{@code UNIQUE (projectId, idempotencyKey)} 是按请求判的：几批共用一个键时，
     * 第二批会命中第一批的缓存对账单直接返回，后面的结论一条都写不进去，
     * 而 SDK 拿到的是两份看起来都成功的对账单。派生保证了重试第 N 批时算出来的
     * 还是同一个键——这才是「重试复用幂等键」（§7.2 第 2 条）。
     */
    public static List<IngestExecutionRequestWire> buildExecutionRequests(
            ReporterConfig config, List<CaseResultInput> results, ExecutionWindow window) {
        String startedAt = toIso(window.startedAt());
        String finishedAt = toIso(window.finishedAt());
        List<List<CaseResultInput>> batches = chunkResults(results);
        List<IngestExecutionRequestWire> requests = new ArrayList<>(batches.size());
        for (int batchIndex = 0; batchIndex < batches.size(); batchIndex++) {
            requests.add(new IngestExecutionRequestWire(
                    config.branch(),
                    config.ciUrl(),
                    config.commitSha(),
                    finishedAt,
                    Idempotency.deriveBatchIdempotencyKey(config.idempotencyKey(), batchIndex),
                    config.overwriteManual(),
                    config.projectId(),
                    batches.get(batchIndex).stream().map(ExecutionBatches::toWireResult).toList(),
                    config.runIds(),
                    startedAt));
        }
        return requests;
    }

    private static IngestExecutionResultWire toWireResult(CaseResultInput input) {
        return new IngestExecutionResultWire(
                input.durationMs(), truncateMessage(input.message()), input.result(), input.sourceRef());
    }

    private static String toIso(Instant moment) {
        return moment == null ? null : ISO_MILLIS.format(moment);
    }
}

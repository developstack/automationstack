package org.automationstack.sdk;

import java.util.ArrayList;
import java.util.List;

/**
 * 正常路径上的**唯一一次**网络往返形态：{@code POST /ingest/executions}（§7.2 第 5 条）。
 *
 * <p>**不做预检**：跑之前没有任何需要人确认的配置——归属由用例的 sourceRef 自己解析
 * （§3.7），既没有「上报目标」也没有槽位。{@code GET /ingest/runs} 是留给人排查用的，
 * 本包不在正常路径上调它（{@code NoPreflightTest} 盯着这件事）。
 *
 * <p>分批时会有多次 POST，但那是同一件事的分片，不是「先问一下再报」。
 */
public final class SubmitExecution {

    private SubmitExecution() {
    }

    public static IngestExecutionReceipt submitExecution(
            IngestHttpClient client, ReporterConfig config,
            List<CaseResultInput> results, ExecutionWindow window) {
        List<IngestExecutionRequestWire> requests =
                ExecutionBatches.buildExecutionRequests(config, results, window);
        List<IngestExecutionReceipt> receipts = new ArrayList<>(requests.size());
        for (IngestExecutionRequestWire request : requests) {
            // 串行而不是开线程池：并发几批会在服务端互相抢同一批 `test_runs` 的行锁
            // （`ensureRunWritable` 的 `FOR UPDATE`），把本来省下的往返又赔进去。
            receipts.add(IngestExecutionReceipt.fromWire(
                    client.postJson(RoutePaths.INGEST_EXECUTIONS_ROUTE, request.toWire())));
        }
        return ReceiptMerge.mergeReceipts(receipts);
    }
}

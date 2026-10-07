package org.automationstack.sdk;

import java.util.ArrayList;
import java.util.List;

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
            receipts.add(IngestExecutionReceipt.fromWire(
                    client.postJson(RoutePaths.INGEST_EXECUTIONS_ROUTE, request.toWire())));
        }
        return ReceiptMerge.mergeReceipts(receipts);
    }
}

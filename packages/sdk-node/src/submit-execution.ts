import type { ReporterConfig } from "./config.js";
import type { IngestExecutionReceipt } from "./contract-types.js";
import {
	buildExecutionRequests,
	type ExecutionWindow,
} from "./execution-batches.js";
import type { IngestHttpClient } from "./http-client.js";
import { mergeReceipts } from "./receipt-merge.js";
import type { CaseResultInput } from "./reporter-types.js";
import { INGEST_EXECUTIONS_ROUTE } from "./route-paths.js";

export async function submitExecution(args: {
	client: IngestHttpClient;
	config: ReporterConfig;
	results: CaseResultInput[];
	window: ExecutionWindow;
}): Promise<IngestExecutionReceipt> {
	const requests = buildExecutionRequests({
		config: args.config,
		results: args.results,
		window: args.window,
	});
	const receipts: IngestExecutionReceipt[] = [];
	for (const request of requests) {
		receipts.push(
			// biome-ignore lint/performance/noAwaitInLoops: 串行是刻意的，理由见上一行注释
			await args.client.postJson<IngestExecutionReceipt>(
				INGEST_EXECUTIONS_ROUTE,
				request
			)
		);
	}
	return mergeReceipts(receipts);
}

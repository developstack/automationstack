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

/**
 * 正常路径上的**唯一一次**网络往返形态：`POST /ingest/executions`（§7.2 第 5 条）。
 *
 * **不做预检**：跑之前没有任何需要人确认的配置——归属由用例的 sourceRef 自己
 * 解析（§3.7），既没有「上报目标」也没有槽位。`GET /ingest/runs` 是留给人
 * 排查用的，本包不在正常路径上调它（`no-preflight.test.ts` 盯着这件事）。
 *
 * 分批时会有多次 POST，但那是同一件事的分片，不是「先问一下再报」。
 */
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
		// 串行而不是 Promise.all：并发几批会在服务端互相抢同一批 `test_runs`
		// 的行锁（`ensureRunWritable` 的 `FOR UPDATE`），把本来省下的往返又赔进去。
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

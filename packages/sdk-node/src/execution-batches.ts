import type { ReporterConfig } from "./config.js";
import {
	MAX_INGEST_COMMENT_LENGTH,
	RESULTS_PER_BATCH,
} from "./contract-limits.js";
import type {
	IngestExecutionRequestWire,
	IngestExecutionResultWire,
} from "./contract-types.js";
import { deriveBatchIdempotencyKey } from "./idempotency.js";
import type { CaseResultInput } from "./reporter-types.js";

/**
 * 把攒了一整轮的结果切成若干个请求体（§7.2 第 1 条「缓冲后批量提交」）。
 *
 * **不逐条发**：`ensureRunWritable` 对 `test_runs` 行加 `FOR UPDATE`，逐条上报
 * 就是逐条开事务抢同一把行锁，80 条就是 80 次串行往返；QA 本机的网络还不稳，
 * 跑一条报一条既慢又碎（§5.5 / D29）。
 */

export interface ExecutionWindow {
	finishedAt: Date | null;
	startedAt: Date | null;
}

const TRUNCATION_SUFFIX = "…（已截断，完整堆栈见 log 附件）";

/**
 * 截断在 SDK 侧先做一次（§5.1.1 明确写了「SDK 侧负责」）。
 * 尾巴上留一句话说明被截了：不留的话，人在失败清单上看到的是一句
 * 戛然而止的堆栈，会以为是脚本自己输出成那样的。
 */
function truncateMessage(message: string | null | undefined): string | null {
	if (!message) {
		return null;
	}
	if (message.length <= MAX_INGEST_COMMENT_LENGTH) {
		return message;
	}
	const keep = MAX_INGEST_COMMENT_LENGTH - TRUNCATION_SUFFIX.length;
	return `${message.slice(0, keep)}${TRUNCATION_SUFFIX}`;
}

function toWireResult(input: CaseResultInput): IngestExecutionResultWire {
	return {
		durationMs: input.durationMs ?? null,
		message: truncateMessage(input.message),
		result: input.result,
		sourceRef: input.sourceRef,
	};
}

export function chunkResults(
	results: CaseResultInput[],
	batchSize: number = RESULTS_PER_BATCH
): CaseResultInput[][] {
	if (results.length === 0) {
		// 空数组仍然要发一批：一次「过滤条件没匹配上任何用例」的执行照样该留下
		// 执行记录，而且 `writtenTo` 为空这件事必须由服务端的对账单说出来
		// （§7.2 第 4 条要透传的正是它的理由），SDK 自己短路掉就没有理由可透传。
		return [[]];
	}
	const batches: CaseResultInput[][] = [];
	for (let start = 0; start < results.length; start += batchSize) {
		batches.push(results.slice(start, start + batchSize));
	}
	return batches;
}

/**
 * ⚠️ **每批一个不同的幂等键，但每个键都从同一个 run key 确定性派生**。
 *
 * `UNIQUE (projectId, idempotencyKey)` 是按请求判的：几批共用一个键时，
 * 第二批会命中第一批的缓存对账单直接返回，后面的结论一条都写不进去，
 * 而 SDK 拿到的是两份看起来都成功的对账单。派生保证了重试第 N 批时
 * 算出来的还是同一个键——这才是「重试复用幂等键」（§7.2 第 2 条）。
 */
export function buildExecutionRequests(args: {
	config: ReporterConfig;
	results: CaseResultInput[];
	window: ExecutionWindow;
}): IngestExecutionRequestWire[] {
	const { config, results, window } = args;
	return chunkResults(results).map((batch, batchIndex) => ({
		branch: config.branch,
		ciUrl: config.ciUrl,
		commitSha: config.commitSha,
		finishedAt: window.finishedAt?.toISOString() ?? null,
		idempotencyKey: deriveBatchIdempotencyKey(
			config.idempotencyKey,
			batchIndex
		),
		overwriteManual: config.overwriteManual,
		projectId: config.projectId,
		results: batch.map(toWireResult),
		runIds: config.runIds,
		startedAt: window.startedAt?.toISOString() ?? null,
	}));
}

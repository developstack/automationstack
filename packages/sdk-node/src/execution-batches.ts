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

export interface ExecutionWindow {
	finishedAt: Date | null;
	startedAt: Date | null;
}

const TRUNCATION_SUFFIX = "…（已截断，完整堆栈见 log 附件）";

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
		return [[]];
	}
	const batches: CaseResultInput[][] = [];
	for (let start = 0; start < results.length; start += batchSize) {
		batches.push(results.slice(start, start + batchSize));
	}
	return batches;
}

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

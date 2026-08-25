/**
 * 本包的公开导出面。
 *
 * 全部用 `export ... from`，**不是 barrel**（`noExportedImports` 是 error）：
 * 这里不 import 任何东西再转手导出，只是把几个模块的导出面并起来。
 */

// biome-ignore lint/performance/noBarrelFile: 这是包的公开入口本身，不是「顺手 re-export 一切」的中转文件；本包只有一个 exports 条目，导出面必须有一处
export {
	AttachmentInputError,
	loadAttachment,
	loadAttachments,
} from "./attachment-load";
export {
	type ReporterConfig,
	ReporterConfigError,
	type ReporterConfigInput,
	resolveReporterConfig,
} from "./config";
export {
	ATTACHMENTS_PER_BATCH,
	MAX_INGEST_ATTACHMENTS_PER_REQUEST,
	MAX_INGEST_COMMENT_LENGTH,
	MAX_INGEST_MESSAGE_LENGTH,
	MAX_INGEST_RESULTS_PER_REQUEST,
	MAX_INGEST_SOURCE_REF_LENGTH,
	RESULTS_PER_BATCH,
} from "./contract-limits";
export type {
	AttachmentKind,
	AutomationCaseResult,
	IngestExecutionReceipt,
	IngestOutOfScopeEntry,
	IngestSkippedManualEntry,
	IngestUnmatchedCaseEntry,
	IngestWrittenToEntry,
} from "./contract-types";
export { IngestEmptyWriteError, IngestHttpError } from "./errors";
export {
	buildExecutionRequests,
	chunkResults,
	type ExecutionWindow,
} from "./execution-batches";
export { type FetchLike, IngestHttpClient } from "./http-client";
export {
	deriveBatchIdempotencyKey,
	resolveRunIdempotencyKey,
} from "./idempotency";
export { hasNoWrites, mergeReceipts } from "./receipt-merge";
export {
	formatAttachmentLines,
	formatReceiptLines,
	printReceipt,
	type ReceiptSink,
} from "./receipt-printer";
export {
	AutomationStackReporter,
	type ReporterClientOptions,
	type RunOutcome,
} from "./reporter-client";
export type {
	AttachmentInput,
	AttachmentOutcome,
	CaseResultInput,
	LoadedAttachment,
} from "./reporter-types";
export {
	INGEST_ATTACHMENTS_PRESIGN_ROUTE,
	INGEST_ATTACHMENTS_REGISTER_ROUTE,
	INGEST_EXECUTIONS_ROUTE,
	INGEST_RUNS_ROUTE,
} from "./route-paths";

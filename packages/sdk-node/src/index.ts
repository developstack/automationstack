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
} from "./attachment-load.js";
export {
	type ReporterConfig,
	ReporterConfigError,
	type ReporterConfigInput,
	resolveReporterConfig,
} from "./config.js";
export {
	ATTACHMENTS_PER_BATCH,
	MAX_INGEST_ATTACHMENTS_PER_REQUEST,
	MAX_INGEST_COMMENT_LENGTH,
	MAX_INGEST_MESSAGE_LENGTH,
	MAX_INGEST_RESULTS_PER_REQUEST,
	MAX_INGEST_SOURCE_REF_LENGTH,
	RESULTS_PER_BATCH,
} from "./contract-limits.js";
export type {
	AttachmentKind,
	AutomationCaseResult,
	IngestExecutionReceipt,
	IngestOutOfScopeEntry,
	IngestSkippedManualEntry,
	IngestUnmatchedCaseEntry,
	IngestWrittenToEntry,
} from "./contract-types.js";
export { IngestEmptyWriteError, IngestHttpError } from "./errors.js";
export {
	buildExecutionRequests,
	chunkResults,
	type ExecutionWindow,
} from "./execution-batches.js";
export { type FetchLike, IngestHttpClient } from "./http-client.js";
export {
	deriveBatchIdempotencyKey,
	resolveRunIdempotencyKey,
} from "./idempotency.js";
export { hasNoWrites, mergeReceipts } from "./receipt-merge.js";
export {
	formatAttachmentLines,
	formatReceiptLines,
	printReceipt,
	type ReceiptSink,
} from "./receipt-printer.js";
export {
	AutomationStackReporter,
	type ReporterClientOptions,
	type RunOutcome,
} from "./reporter-client.js";
export type {
	AttachmentInput,
	AttachmentOutcome,
	CaseResultInput,
	LoadedAttachment,
} from "./reporter-types.js";
export {
	INGEST_ATTACHMENTS_PRESIGN_ROUTE,
	INGEST_ATTACHMENTS_REGISTER_ROUTE,
	INGEST_EXECUTIONS_ROUTE,
	INGEST_RUNS_ROUTE,
} from "./route-paths.js";

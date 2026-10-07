import { z } from "zod";

import { testRunStatusSchema } from "../../schemas/test-run";

export const MAX_INGEST_COMMENT_LENGTH = 2000;

export const MAX_INGEST_RESULTS_PER_REQUEST = 2000;

export const MAX_INGEST_SOURCE_REF_LENGTH = 512;

export const MAX_INGEST_MESSAGE_LENGTH = 20_000;

export const automationCaseResultSchema = z.enum([
	"passed",
	"failed",
	"blocked",
	"skipped",
]);

const isoTimestampSchema = z.iso
	.datetime({ offset: true })
	.transform((value) => new Date(value));

export const ingestExecutionResultSchema = z.object({
	durationMs: z.int().nonnegative().nullable().optional(),
	message: z
		.string()
		.max(
			MAX_INGEST_MESSAGE_LENGTH,
			`message 最长 ${MAX_INGEST_MESSAGE_LENGTH} 字符；完整堆栈请作为 log 附件上传，comment 是给人在失败清单上一眼扫的`
		)
		.nullable()
		.optional(),
	result: automationCaseResultSchema,
	sourceRef: z
		.string()
		.min(1)
		.max(
			MAX_INGEST_SOURCE_REF_LENGTH,
			`sourceRef 最长 ${MAX_INGEST_SOURCE_REF_LENGTH} 字符`
		),
});

export const ingestExecutionRequestSchema = z.object({
	branch: z.string().nullable().default(null),
	ciUrl: z.url().nullable().default(null),
	commitSha: z.string().nullable().default(null),
	finishedAt: isoTimestampSchema.nullable().default(null),
	idempotencyKey: z.uuid(),
	overwriteManual: z.boolean().default(false),
	projectId: z.uuid(),
	results: z
		.array(ingestExecutionResultSchema)
		.max(
			MAX_INGEST_RESULTS_PER_REQUEST,
			`一次最多上报 ${MAX_INGEST_RESULTS_PER_REQUEST} 条结果；结果本身没有问题，请分批重发（SDK 建议每批 200 条）`
		),
	runId: z
		.never({
			error:
				"服务端不接受 runId：结论归属由用例的 sourceRef 自己解析，指定不了写进哪个任务。若要收窄本轮的写入范围，请用复数的 runIds 白名单（不传即全部候选）",
		})
		.optional(),
	runIds: z.array(z.uuid()).nullable().default(null),
	startedAt: isoTimestampSchema.nullable().default(null),
});

export const ingestRunsQuerySchema = z.object({ projectId: z.uuid() });

export const ingestExecutionReceiptSchema = z.object({
	executionId: z.uuid(),
	outOfScope: z.array(
		z.object({
			caseId: z.uuid(),
			reason: z.string(),
			runName: z.string().nullable(),
			sourceRef: z.string(),
		})
	),
	skippedManual: z.array(
		z.object({
			reason: z.string(),
			runName: z.string(),
			sourceRef: z.string(),
		})
	),
	unmatchedCases: z.array(
		z.object({ reason: z.string(), sourceRef: z.string() })
	),
	writtenTo: z.array(
		z.object({
			runId: z.uuid(),
			runName: z.string(),
			updated: z.int().nonnegative(),
		})
	),
});

export const ingestRunSummarySchema = z.object({
	caseCount: z.int().nonnegative(),
	daysSinceLastVerdict: z.int(),
	name: z.string(),
	runId: z.uuid(),
	status: testRunStatusSchema,
});

export const ingestRunsResponseSchema = z.object({
	runs: z.array(ingestRunSummarySchema),
});

export type IngestExecutionRequestWire = z.input<
	typeof ingestExecutionRequestSchema
>;
export type IngestExecutionRequest = z.output<
	typeof ingestExecutionRequestSchema
>;
export type IngestExecutionResult = z.output<
	typeof ingestExecutionResultSchema
>;
export type AutomationCaseResult = z.output<typeof automationCaseResultSchema>;
export type IngestExecutionReceipt = z.output<
	typeof ingestExecutionReceiptSchema
>;
export type IngestWrittenToEntry = IngestExecutionReceipt["writtenTo"][number];
export type IngestSkippedManualEntry =
	IngestExecutionReceipt["skippedManual"][number];
export type IngestUnmatchedCaseEntry =
	IngestExecutionReceipt["unmatchedCases"][number];
export type IngestOutOfScopeEntry =
	IngestExecutionReceipt["outOfScope"][number];
export type IngestRunsResponse = z.output<typeof ingestRunsResponseSchema>;

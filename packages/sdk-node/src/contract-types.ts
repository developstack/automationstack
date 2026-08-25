/**
 * ingest 线上契约的**类型副本**（plan §5.1.1 / §5.6）。
 *
 * ## 为什么自带一份，而不是从 `@automationstack/api` import type
 *
 * `import type` 确实会在编译期被擦掉，运行时不会真的加载 api 包。但本包要发到
 * npm，发出去的 `.d.ts` 里那条 `import type { ... } from "@automationstack/api"`
 * 不会被擦掉——装了 SDK 的用户会拿到一个指向不存在的包的类型引用，
 * 而那个包是**私有的、永远不会发布的**（它拖着 drizzle、orpc、aws-sdk）。
 * 「编译期擦除」只对本仓库内部成立，对下游不成立。
 *
 * 另外两条路也否掉了：
 * - **构建时从 OpenAPI 生成**：要引一个代码生成器（catalog 之外的新依赖），
 *   还会让「读 SDK 源码就能看懂发的是什么」这件事失效；更要命的是 pytest 与
 *   JUnit 那两家根本没法 import TypeScript，它们无论如何都得自带一份，
 *   Node 这边搞特殊只会让三家的对齐方式各不相同（D27 要的正是三家照同一份规范）。
 * - **让 api 包变成运行时依赖**：直接违背「SDK 只需要一个 HTTP 客户端」。
 *
 * 所以结论是：**三个 SDK 一律自带一份契约副本，一律用一致性测试兜底漂移**。
 * Node 这边的兜底比另外两家强一档（`contract-parity.test.ts` 直接 import 服务端
 * 那份 zod schema，用真实 schema 去 parse SDK 造出来的包），W6/W7 照抄这条路子。
 */

/** 自动化能报出来的结论。**不含 `untested`**——「跑了但没结论」不是一件能表达的事。 */
export type AutomationCaseResult = "blocked" | "failed" | "passed" | "skipped";

/** 与服务端 `attachmentKindSchema` 同一份词汇表。 */
export type AttachmentKind = "log" | "other" | "screenshot" | "video";

export interface IngestExecutionResultWire {
	/**
	 * ⚠️ 服务端收下但**本期不落库**（`test_run_cases` 没有这一列）。
	 * 照发不误：字段在契约里，少发一个字段只会让以后加列时三家 SDK 各改一遍。
	 */
	durationMs?: number | null;
	message?: string | null;
	result: AutomationCaseResult;
	sourceRef: string;
}

/**
 * `POST /ingest/executions` 的请求体。**没有单数的 `runId`**——服务端把那个键
 * 声明成了 `z.never()`，发过去是一条 400，而不是被静默 strip（D31）。
 */
export interface IngestExecutionRequestWire {
	branch?: string | null;
	ciUrl?: string | null;
	commitSha?: string | null;
	finishedAt?: string | null;
	idempotencyKey: string;
	overwriteManual?: boolean;
	projectId: string;
	results: IngestExecutionResultWire[];
	runIds?: string[] | null;
	startedAt?: string | null;
}

export interface IngestWrittenToEntry {
	runId: string;
	runName: string;
	updated: number;
}

export interface IngestSkippedManualEntry {
	reason: string;
	runName: string;
	sourceRef: string;
}

export interface IngestUnmatchedCaseEntry {
	reason: string;
	sourceRef: string;
}

export interface IngestOutOfScopeEntry {
	caseId: string;
	reason: string;
	/** 「没有任何未提交任务收它」时为 null；某个具体任务拒了它时是那个任务的名字。 */
	runName: string | null;
	sourceRef: string;
}

/** 对账单。四个数组各说一件事，**任何两个都不能合并**（§5.1.1）。 */
export interface IngestExecutionReceipt {
	executionId: string;
	outOfScope: IngestOutOfScopeEntry[];
	skippedManual: IngestSkippedManualEntry[];
	unmatchedCases: IngestUnmatchedCaseEntry[];
	writtenTo: IngestWrittenToEntry[];
}

export interface IngestAttachmentPresignItemWire {
	contentType: string;
	kind: AttachmentKind;
	sizeBytes: number;
	sourceRef: string;
}

export interface IngestAttachmentPresignRequestWire {
	attachments: IngestAttachmentPresignItemWire[];
	projectId: string;
	/** 必须与结论那一轮传的是同一份，否则附件会挂到本轮压根没写过的任务上。 */
	runIds?: string[] | null;
}

export interface IngestAttachmentUpload {
	/** 签名时锁定的值，PUT 时必须**逐字**带上，大小写都不能变。 */
	contentType: string;
	/** 请求里 `attachments` 数组的下标——同一个本地文件可能拿到多个 URL（D33）。 */
	index: number;
	runCaseId: string;
	runId: string;
	runName: string;
	sourceRef: string;
	storageKey: string;
	uploadUrl: string;
}

export interface IngestAttachmentRejection {
	index: number;
	reason: string;
	runName: string | null;
	sourceRef: string;
}

export interface IngestAttachmentPresignReceipt {
	expiresInSeconds: number;
	rejected: IngestAttachmentRejection[];
	/** R2 未配置时为 false，此时 `uploads` 为空、每项各有一条 `rejected`。仍是 200。 */
	storageConfigured: boolean;
	uploads: IngestAttachmentUpload[];
}

export interface IngestAttachmentRegisterItemWire {
	fileName: string;
	kind: AttachmentKind;
	/** presign 那一轮返回的值，原样回传，不要自己拼。 */
	runCaseId: string;
	runId: string;
	storageKey: string;
}

export interface IngestAttachmentRegisterRequestWire {
	attachments: IngestAttachmentRegisterItemWire[];
}

export interface IngestAttachmentRegistered {
	attachmentId: string;
	index: number;
	runCaseId: string;
	storageKey: string;
}

export interface IngestAttachmentRegisterRejection {
	index: number;
	reason: string;
	runCaseId: string;
	storageKey: string;
}

export interface IngestAttachmentRegisterReceipt {
	registered: IngestAttachmentRegistered[];
	rejected: IngestAttachmentRegisterRejection[];
	storageConfigured: boolean;
}

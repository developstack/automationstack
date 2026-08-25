import { z } from "zod";

import { testRunStatusSchema } from "../../schemas/test-run";

/**
 * `POST /ingest/executions` 与 `GET /ingest/runs` 的**线上契约**（plan §5.1.1）。
 *
 * 单独一个文件、且**只 import zod**：三种语言的 SDK 都照着这里的形状发包，
 * 契约必须能被单独读懂，也必须能被测试直接 import——api 包的 vitest project
 * 不带 `DATABASE_URL`，任何一条通向 `@automationstack/db` 的运行时 import
 * 都会让 import 这个文件的测试在模块求值期就炸（同 `auth/bearer-token.ts` 的分文件理由）。
 * 编排在 `./execution-ingest`，分桶在 `./execution-reconcile`。
 */

/**
 * `message` 落进 `test_run_cases.comment` 时的服务端上限（§5.1.1）。
 *
 * §5.1.1 把截断写成「SDK 侧负责」，这里仍然再截一次：三个 SDK 各写各的截断，
 * 只要有一个把「2000 字符」写成「2000 字节」或者干脆忘了，进来的就是一整段
 * 带堆栈的日志。`comment` 是给人在失败清单上一眼扫的，不是日志容器——
 * 完整堆栈走 `log` 附件。校验放在 schema 上会把整批打成 400，
 * 那是拿「上报方少写了一行截断」去惩罚一整轮真实的测试结论，所以这里只截不拒。
 */
export const MAX_INGEST_COMMENT_LENGTH = 2000;

/**
 * 一次请求最多带多少条结果。
 *
 * §5.5 只说了「SDK 攒完一次执行的全部结果一次提交，超过 200 条分批」，
 * 那是给 SDK 的建议；这里是**服务端的硬闸**，因为这是拿 token 就能打的外部端点。
 * 没有上限时，一次几万条的请求会一路走到 `applyAutomationVerdicts` 里那条
 * `from (values ...)`：每行 3 个绑定参数，Postgres 的协议上限是 65535 个，
 * 两万多行就会以一句驱动层的「too many parameters」炸掉——上报方看到的是 500,
 * 而正确的行为是一条指着字段名、告诉他分批重发的 400。
 *
 * 取 2000 而不是 200：SDK 的建议值是给网络往返定的，服务端没有理由把
 * 「一次多发一点」判成错误；2000 离参数上限还有一个数量级的余量。
 */
export const MAX_INGEST_RESULTS_PER_REQUEST = 2000;

/**
 * `sourceRef` 的长度上限。**不是防攻击，是让畸形输入在契约层就得到一条能读懂的拒绝。**
 *
 * 它原样进 `resolveAutomationTargets` 的 `= any($2::text[])`。没有上限时，
 * 一个把整份日志错拼进用例标识的 SDK bug 会安静地匹配不到任何用例、
 * 进 `unmatchedCases`，上报方对着一份「项目里没有这个 sourceRef」的对账单
 * 完全看不出自己发了什么。几百字符对任何真实的用例标识都绰绰有余。
 */
export const MAX_INGEST_SOURCE_REF_LENGTH = 512;

/**
 * `message` 的**受理**上限，与 `MAX_INGEST_COMMENT_LENGTH`（展示截断）是两件事。
 *
 * 截断照常发生在 2000 字符，所以正常的长堆栈一律照收不误——这个值只用来拒绝
 * 「把整个日志文件塞进了 message」这种畸形输入。放在远大于截断值的地方，
 * 是为了让「超长」永远不是一条正常上报会撞上的边界：真撞上了，
 * 那确实是 SDK 那边把 `log` 附件的内容错填进了这个字段。
 */
export const MAX_INGEST_MESSAGE_LENGTH = 20_000;

/**
 * 自动化能报出来的结论，**故意不含 `untested`**（对比 `testRunCaseResultSchema`）。
 *
 * 「脚本跑了但没有结论」不是一件能表达的事：真让它进来，
 * `applyAutomationVerdicts` 会抛异常（它在 db 层点名拦了这个值），
 * 于是一整批真实结论会因为一条畸形输入变成 500。在 schema 上砍掉，
 * 上报方拿到的是一条指着字段名的 400，而不是一句「服务器错误」。
 */
export const automationCaseResultSchema = z.enum([
	"passed",
	"failed",
	"blocked",
	"skipped",
]);

/**
 * 客户端时钟报上来的时间点。`offset: true` 同时放行 `...Z` 与 `...+08:00`：
 * JS 的 `toISOString()` 出前者、Python 的 `datetime.isoformat()` 出后者，
 * 只收一种就等于让其中一家 SDK 永远 400。不带时区的本地时间仍然拒绝——
 * 那是歧义值，落库之后没有任何办法还原它指的是哪一刻。
 */
const isoTimestampSchema = z.iso
	.datetime({ offset: true })
	.transform((value) => new Date(value));

export const ingestExecutionResultSchema = z.object({
	/**
	 * ⚠️ **收下但本期不落库。结论：保留声明，既不删也不存**，逐条核对过的依据如下。
	 *
	 * 1. **存不进去**：库里没有任何一列放单条用例的耗时——`test_run_cases`
	 *    的全部列里没有（只有 `executedAt` 这个时间点），`automation_executions`
	 *    只有整轮的 `startedAt` / `finishedAt`。要存就得加列 + migration，
	 *    那是 `packages/db` 的范围，不是这里能顺手做的事。
	 * 2. **不能从契约里删**：plan §5.1.1 的请求体样例里逐字写着这个字段，
	 *    三家 SDK 照那段样例发包；删掉声明契约就与计划文档打架了。
	 * 3. **声明它本身有作用**，不只是文档：本 schema 刻意不是 strict（见下面
	 *    `runId` 那段的最后一句），未声明的键会被 zod **静默 strip**。声明之后
	 *    `durationMs: "1820"` 或 `-1` 拿到的是一条指着字段名的 400，而不是被
	 *    悄悄抹掉——「收下」与「收下且校验」是两件事，这里要的是后者。
	 *
	 * 于是它在服务端唯一的去向就是被丢弃。真要落库，唯一的落点是
	 * `test_run_cases` 加一列（连同 `applyAutomationVerdicts` 的写入路径），
	 * 不是往 `automation_executions.receipt` 那个 jsonb 里塞——对账单是
	 * 「当时说过的话」（§5.2），不是给数据找地方藏的口袋。
	 */
	durationMs: z.int().nonnegative().nullable().optional(),
	/**
	 * 失败时的一行说明，落进 `comment`。
	 *
	 * 两道尺子别搞混：这里的 `.max()` 是**受理**上限（超了整批 400），
	 * 展示用的截断在 `MAX_INGEST_COMMENT_LENGTH`（2000，只截不拒）。
	 */
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
	/** SDK 生成，一次进程启动一个（§5.2）；`UNIQUE (projectId, idempotencyKey)` 兜底。 */
	idempotencyKey: z.uuid(),
	/** D23：true 时连人工结论一起覆盖。默认 false——覆盖别人手打的结论必须是显式动作。 */
	overwriteManual: z.boolean().default(false),
	projectId: z.uuid(),
	/**
	 * 空数组是合法输入：一次「过滤条件没匹配上任何用例」的执行照样应该留下执行记录，
	 * 把它打成 400 只会让 SDK 分不清是自己发错了还是本来就没跑到东西。
	 *
	 * 上限见 `MAX_INGEST_RESULTS_PER_REQUEST`。拒绝信息里点名「分批重发」：
	 * 这不是数据本身有问题，上报方不该跑去检查自己的用例。
	 */
	results: z
		.array(ingestExecutionResultSchema)
		.max(
			MAX_INGEST_RESULTS_PER_REQUEST,
			`一次最多上报 ${MAX_INGEST_RESULTS_PER_REQUEST} 条结果；结果本身没有问题，请分批重发（SDK 建议每批 200 条）`
		),
	/**
	 * ⚠️ **这个键存在，只为了让它显式失败**（D31）。
	 *
	 * 不声明它的话，zod 会把它静默 strip 掉——而「静默 strip」等于 D31 那段话里
	 * 「留一个能传的口子」原封不动地还在，只是失败得更隐蔽：有人在 CI 里写了
	 * `runId`，拿到 200，以为这轮只写了那一个任务，实际写进了全部候选。
	 * 那正是 D34「静默写进别人的任务和写错任务一样糟」说的那件事，
	 * 区别只在于写错任务还有人会发现。
	 *
	 * 只钉这一个键，**不把整个 schema 改成 strict**：strict 会让 SDK 以后
	 * 多发一个新字段变成硬失败，而向前兼容正是 `durationMs` 那条注释在保的东西。
	 */
	runId: z
		.never({
			error:
				"服务端不接受 runId：结论归属由用例的 sourceRef 自己解析，指定不了写进哪个任务。若要收窄本轮的写入范围，请用复数的 runIds 白名单（不传即全部候选）",
		})
		.optional(),
	/**
	 * D31：这里**只有复数的白名单**，没有、也永远不会有单数的 `runId`。
	 *
	 * `null` = 不收窄，全部候选；非 null = 候选先与它取交集。留一个单数
	 * 「往哪写」的口子，就一定会有人在 CI 变量里写死一个 runId，
	 * 下个迭代它就变成一条静默写错任务的路径——归属只能由用例自己解析（§3.7）。
	 * 空数组同样合法，含义是「这轮谁都不写」，与 `null` 完全不同。
	 */
	runIds: z.array(z.uuid()).nullable().default(null),
	startedAt: isoTimestampSchema.nullable().default(null),
});

export const ingestRunsQuerySchema = z.object({ projectId: z.uuid() });

/**
 * 对账单（§5.1.1），不是 `{ ok: true }`。
 *
 * 四个数组各说一件事，**任何两个都不能合并**：
 * - `writtenTo` 按任务分组，D34 的落点——一次上报写进了三个任务，SDK 日志里就得有三行。
 *   静默写进别人的任务和写错任务一样糟，区别只在于后者有人会发现。
 * - `skippedManual` 带 `runName`：同一条 sourceRef 可能在 A 任务写成功、
 *   在 B 任务被人工结论挡下（D23 按行生效），不带任务名的对账单看上去自相矛盾。
 * - `unmatchedCases` 没有 `caseId`，因为项目里压根没有这条用例——人该去查
 *   `AS_PROJECT` 指对了没有、或者用例上的 `sourceRef` 填了没有。
 * - `outOfScope` 必带 `caseId`：用例在，只是没有未提交的任务收它，
 *   前端要拿这个 id 做「一键追加到某个任务」（D24），没有它这个按钮无从谈起。
 *
 * 三类拒绝逐条列出、绝不静默丢弃，沿用 `InvalidRunCases` 的既定语义。
 */
export const ingestExecutionReceiptSchema = z.object({
	executionId: z.uuid(),
	outOfScope: z.array(
		z.object({
			caseId: z.uuid(),
			reason: z.string(),
			/**
			 * 「没有任何未提交任务收它」时为 null；「某个具体任务拒了它」
			 * （待评审、写入前一瞬被提交）时是那个任务的名字。
			 * 与 `skippedManual.runName` 同因：不指名道姓，一条在 A 写成功、
			 * 在 B 被拒的 sourceRef 会让对账单读起来自相矛盾。
			 */
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
	/** 距最近一条结论多少天，没有结论则距创建时间。**只披露，不裁决**（§5.1.1 / §6.4）。 */
	daysSinceLastVerdict: z.int(),
	name: z.string(),
	runId: z.uuid(),
	status: testRunStatusSchema,
});

export const ingestRunsResponseSchema = z.object({
	runs: z.array(ingestRunSummarySchema),
});

/** 线上原样（`startedAt` / `finishedAt` 还是字符串）。SDK 照这个发包。 */
export type IngestExecutionRequestWire = z.input<
	typeof ingestExecutionRequestSchema
>;
/** 解析后（时间已是 `Date`、默认值已填）。服务端内部一律用这个。 */
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

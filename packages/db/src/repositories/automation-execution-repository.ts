import { and, asc, count, eq, sql } from "drizzle-orm";

import { db } from "../index";
import {
	type AutomationExecution,
	automationExecutions,
} from "../schema/automation-executions";
import { testRunCases, testRuns } from "../schema/test-runs";

/**
 * 自动化上报取数层的**执行记录**部分（plan §5.2 / §5.5）：
 * 把「这一轮跑过了」这个事实钉在库里，以及事后按指针反查它还占着哪些行。
 *
 * 它写的**只有 `automation_executions` 这一张表**。「不写 `test_run_cases.result`」
 * 与「不做自动提交结算」这两条禁令对本文件同样成立，完整理由见
 * `automation-ingest-repository.ts` 的文件头。
 */

export interface CreateAutomationExecutionInput {
	branch: string | null;
	ciUrl: string | null;
	commitSha: string | null;
	finishedAt: Date | null;
	idempotencyKey: string;
	projectId: string;
	reportedBy: string | null;
	startedAt: Date | null;
}

/** 已存在同键的那一行（`kind: "existing"`），或刚建出来的新行（`kind: "created"`）。 */
export type EnsureAutomationExecutionResult =
	| { execution: AutomationExecution; kind: "created" }
	| { execution: AutomationExecution; kind: "existing" };

/**
 * 幂等地占住 `(projectId, idempotencyKey)` 这一格（§5.2），`completedAt` 留 null。
 *
 * ## 为什么不是「先查再插」
 *
 * 三种语言的 SDK 都会重试（超时、网络抖动、CI retry），并发重试是常态而不是边界。
 * 「先查再插」在两次重试同时到达时会插出两行，之后两轮各写各的，
 * 幂等从此永远判不出来——`test_run_cases_run_id_case_id_uq` 上那条注释说的就是这件事。
 * 唯一约束是数据库替我们串行化的地方，`insert ... on conflict do nothing returning *`
 * 返回空即代表撞了键，这时再把那一行 select 回来标成 `existing`。
 *
 * ## 调用方拿到 `existing` 之后该怎么办（§5.2 / §5.5）
 *
 * - `completedAt !== null`：那一轮已经全部写完，**直接把 `receipt` 列里存着的
 *   那份对账单逐字返回**，不要重跑、更不要按当前指针重算（重算的两条实测后果
 *   写在 `schema/automation-executions.ts` 的 `receipt` 注释里）。
 * - `completedAt === null`：上一轮没跑完（进程被杀、某个任务的事务回滚），
 *   **整轮重跑**。重放是安全的：同一个 `(runCaseId, result)` 再写一次，
 *   `buildRunCaseEventRows` 因 `fromResult === toResult` 返回空数组，
 *   审计流水里不会留下一串 `passed → passed`（§5.5）。
 *
 * ## 为什么幂等键的作用域是项目而不是测试任务
 *
 * 一次执行本来就可能横跨多个任务（§3.7 D33）。键挂在任务上会出现
 * 「同一次执行在 A 任务已落库、在 B 任务还没」的半完成状态，
 * 而重试时它看起来是两个各自独立的幂等判定——A 那边判「已完成」跳过，
 * B 那边判「没见过」新建，两半永远拼不回一次执行。
 */
export async function ensureAutomationExecution(
	input: CreateAutomationExecutionInput
): Promise<EnsureAutomationExecutionResult> {
	const [created] = await db
		.insert(automationExecutions)
		.values({
			branch: input.branch,
			ciUrl: input.ciUrl,
			commitSha: input.commitSha,
			finishedAt: input.finishedAt,
			idempotencyKey: input.idempotencyKey,
			projectId: input.projectId,
			reportedBy: input.reportedBy,
			startedAt: input.startedAt,
		})
		.onConflictDoNothing({
			target: [
				automationExecutions.projectId,
				automationExecutions.idempotencyKey,
			],
		})
		.returning();
	if (created) {
		return { execution: created, kind: "created" };
	}
	const [existing] = await db
		.select()
		.from(automationExecutions)
		.where(
			and(
				eq(automationExecutions.projectId, input.projectId),
				eq(automationExecutions.idempotencyKey, input.idempotencyKey)
			)
		)
		.limit(1);
	if (!existing) {
		// 撞了唯一键却查不回那一行，只可能是有人在这两条语句之间把它删了。
		// 这不是可预期的业务分支（没有删除执行记录的入口），所以走异常而不是类型化返回。
		throw new Error(
			`automation execution vanished after unique conflict: project=${input.projectId}`
		);
	}
	return { execution: existing, kind: "existing" };
}

export interface CompleteAutomationExecutionInput {
	id: string;
	/**
	 * 这一轮**即将返回给上报方的那份完整对账单**，原样落进 `receipt` 列。
	 * 形状是 api 层的 `IngestExecutionReceipt`；db 只负责存，不解释（契约在 api 侧）。
	 */
	receipt: unknown;
	skippedCount: number;
	updatedCount: number;
}

/**
 * 全部任务都写完之后才调：落 `completedAt`、`receipt` 与两个全局冗余计数（§5.5 第 3 步）。
 *
 * ⚠️ **`receipt` 必须和 `completedAt` 在同一条 UPDATE 里**。分成两句，中间挂掉就会
 * 留下一行「已完成但没有对账单」——而 `completedAt` 非空正是幂等重放判定「直接返回
 * 缓存对账单」的依据，那一格空着就等于把重放推回重算那条会说假话的路（§5.2）。
 *
 * `completedAt` 用 `now()` 而不是应用时钟：它是「服务端这一轮收尾了」的判据，
 * 与客户端报上来的 `finishedAt` 不是一回事，掺进客户端时钟会让幂等判定跟着漂。
 *
 * ⚠️ `skippedCount` / `updatedCount` 是**跨全部被写入任务**的全局计数（§3.2）。
 * 一次跨三个任务的执行，这两列对其中任何单个任务都是虚高的。
 * **报告里任何按任务的数字都必须回 `test_run_cases` 现算，不许读这两列**——
 * 拿去当分子分母不会报错，只会让报告静默地数错。
 *
 * 中途失败时本函数根本不会被调到，于是库里留下一行 `completedAt = null`，
 * 冗余计数停在 0。这正是上面那条禁令的实际原因，不是洁癖。
 */
export async function completeAutomationExecution(
	input: CompleteAutomationExecutionInput
): Promise<void> {
	await db
		.update(automationExecutions)
		.set({
			completedAt: sql`now()`,
			receipt: input.receipt,
			skippedCount: input.skippedCount,
			updatedCount: input.updatedCount,
		})
		.where(eq(automationExecutions.id, input.id));
}

export interface AutomationExecutionRunSummary {
	runId: string;
	runName: string;
	updated: number;
}

/**
 * 按 `test_run_cases.lastAutomationExecutionId` 反查这次执行**现在**还占着哪些行。
 *
 * ⚠️ **它回答的不是「当时的对账单长什么样」**。那份对账单现在原样存在
 * `automation_executions.receipt` 里，幂等重放逐字返回那一份（§5.2）；
 * 本函数按指针现算，某条结论被另一轮执行覆盖之后就不再计入这一轮——
 * 对「这次执行现在还占着哪些行」这个问题这是**对的**答案，对「当时说了什么」
 * 则是假话（实测：K1 写入 → K2 覆盖 → 重放 K1 得到空数组，而 §7.2 第 4 条
 * 要求 SDK 对空的 `writtenTo` 报错退出，一次网络重试就成了假的构建失败）。
 *
 * 服务对象因此有两个，都不是「重算对账单」：
 * 1. 报告里的执行记录块（§6.3）——它问的正是「这次执行现在还占着哪些行」；
 * 2. `receipt` 为 null 的历史行（0009 之前写下的）重放时的降级路径，
 *    见 `execution-ingest.ts` 的 `cachedReceipt`。
 *
 * 一条 SQL 分组出全部任务，不许 N+1。
 */
export function summarizeAutomationExecutionRuns(
	executionId: string
): Promise<AutomationExecutionRunSummary[]> {
	return db
		.select({
			runId: testRuns.id,
			runName: testRuns.name,
			updated: count(testRunCases.id),
		})
		.from(testRunCases)
		.innerJoin(testRuns, eq(testRuns.id, testRunCases.runId))
		.where(eq(testRunCases.lastAutomationExecutionId, executionId))
		.groupBy(testRuns.id, testRuns.name)
		.orderBy(asc(testRuns.name));
}

import { count, desc, eq, sql } from "drizzle-orm";

import { db } from "../index";
import { type TestRunEvent, testRunEvents } from "../schema/test-run-events";
import {
	type TestRun,
	type TestRunStatus,
	testRunCases,
	testRuns,
} from "../schema/test-runs";
import { users } from "../schema/users";
import type { DbTransaction } from "./repository-types";
import {
	deriveRunStatusSteps,
	evaluateRunWritable,
	type RunConclusionCounts,
	type RunWritableResult,
} from "./test-run-status-core";

/**
 * 测试任务状态的**推导引擎**与它写出的审计流水（plan §4.1）。
 *
 * 本文件是全包写路径的地基，只放三类东西：行锁、`submitted` 守卫、
 * 「状态 = 结论的函数」这段推导，以及推导写出的 `test_run_events` 的读取。
 *
 * 另外两类状态变更各自成文件，因为触发它们的是完全不同的东西：
 * - `test-run-transitions-repository.ts` —— 人按下按钮的流转（评审、提交）；
 * - `test-run-auto-submit-repository.ts` —— 读路径上的惰性超时结算，没有操作人。
 */

/**
 * 取出测试任务并对该行加行锁，**本包所有写路径的第一句都必须是它**。
 *
 * 没有这把锁的竞态（plan §4.1）：小张打最后一条（统计出 untested = 0，想置
 * `completed`），小李同时把另一条回退成 untested（统计出 untested = 1，想置
 * `in_progress`）。两个事务各自统计、各自得出矛盾结论，谁后提交谁赢——
 * 测试任务的状态会和实际结果长期对不上，而且没有任何地方会报错。
 * 加锁之后第二个事务会等第一个提交完再重新统计，结论必然与实际一致。
 */
export async function lockTestRun(
	tx: DbTransaction,
	runId: string
): Promise<TestRun | undefined> {
	const [run] = await tx
		.select()
		.from(testRuns)
		.where(eq(testRuns.id, runId))
		.limit(1)
		.for("update");
	return run;
}

/**
 * `submitted` 终态守卫：锁行 + 判定，**供本包所有写路径复用**
 * （W3 的附件、W4 的 Jira 缺陷字段也走这里）。
 *
 * 必须在写操作所在的**同一个事务**里调用，绝不能在 router 里「先查一次再调
 * repository」——那中间隔着一次网络往返，别人正好在这期间点了「提交报告」，
 * 于是一份已经锁死、已经发出去的报告被悄悄改了数（plan §4.2）。
 */
export async function ensureRunWritable(
	tx: DbTransaction,
	runId: string
): Promise<RunWritableResult> {
	return evaluateRunWritable(await lockTestRun(tx, runId));
}

/** 同事务内重新统计结论覆盖情况（plan §4.1 第 ② 步）。 */
export async function countRunConclusions(
	tx: DbTransaction,
	runId: string
): Promise<RunConclusionCounts> {
	const [row] = await tx
		.select({
			total: count(),
			untested:
				sql<number>`count(*) filter (where ${testRunCases.result} = 'untested')`.mapWith(
					Number
				),
		})
		.from(testRunCases)
		.where(eq(testRunCases.runId, runId));
	return { total: row?.total ?? 0, untested: row?.untested ?? 0 };
}

interface StatusPatch {
	completedAt: Date | null;
	startedAt?: Date;
	status: TestRunStatus;
}

function buildStatusPatch(
	run: TestRun,
	steps: TestRunStatus[],
	now: Date
): StatusPatch {
	const finalStatus = steps.at(-1) ?? run.status;
	const patch: StatusPatch = {
		// 末态不是 completed 就一定要把 completedAt 抹掉：测试任务被拉回 `in_progress`
		// 而 completedAt 还留着，自动提交的倒计时就会拿一个作废的时间点继续走，
		// 把一个正在测的测试任务锁死。
		completedAt: finalStatus === "completed" ? now : null,
		status: finalStatus,
	};
	// startedAt 只认第一次开测。往返重开时保留原值，否则「这个测试任务什么时候开测的」
	// 会被每一次重开覆盖成最近一次，而那个事实在 test_run_events 里才有完整记录。
	if (steps.includes("in_progress") && run.startedAt === null) {
		patch.startedAt = now;
	}
	return patch;
}

export interface ApplyRunStatusOptions {
	actorId: string | null;
	/** 必须是 `lockTestRun` / `ensureRunWritable` 刚取回的、已加锁的行。 */
	run: TestRun;
}

/**
 * plan §4.1 的状态推导：**任何改动 `test_run_cases.result` 或增删 run_case 的
 * 操作，末尾都要调它**，且必须在同一个事务、同一把行锁之下。
 *
 * 状态被做成「结论的函数」而不是一个要人维护的开关：只要每条写路径都在结尾
 * 重新推导一次，状态就不可能和统计数字对不上。反过来，只要有一条写路径忘了调，
 * 那条路径就会静默地留下一个状态错误的测试任务。
 */
export async function applyRunStatusDerivation(
	tx: DbTransaction,
	options: ApplyRunStatusOptions
): Promise<TestRun> {
	const { actorId, run } = options;
	const counts = await countRunConclusions(tx, run.id);
	const steps = deriveRunStatusSteps(run.status, counts);
	if (steps.length === 0) {
		return run;
	}
	const now = new Date();
	const [updated] = await tx
		.update(testRuns)
		.set(buildStatusPatch(run, steps, now))
		.where(eq(testRuns.id, run.id))
		.returning();
	if (!updated) {
		throw new Error("applyRunStatusDerivation: update returned no row");
	}
	await tx.insert(testRunEvents).values(
		steps.map((toStatus, index) => ({
			actorId,
			// 连跳（ready → in_progress → completed）的两条事件同属一个事务，
			// 默认 now() 会给出完全相同的时间戳，「变更历史」按时间倒序渲染时
			// 两条的先后就成了掷骰子。差 1 毫秒足以把顺序钉死。
			createdAt: new Date(now.getTime() + index),
			fromStatus: index === 0 ? run.status : (steps[index - 1] ?? null),
			runId: run.id,
			toStatus,
		}))
	);
	return updated;
}

export interface TestRunEventItem {
	/** 事件发生时的操作人用户名；系统自动提交为 null（D16）。 */
	actorName: string | null;
	event: TestRunEvent;
}

/** 详情页「变更历史」折叠区：审计用，最近的在前（plan §2.3）。 */
export async function listTestRunEvents(
	runId: string
): Promise<TestRunEventItem[]> {
	const rows = await db
		.select({
			actorName: users.username,
			event: testRunEvents,
		})
		.from(testRunEvents)
		.leftJoin(users, eq(users.id, testRunEvents.actorId))
		.where(eq(testRunEvents.runId, runId))
		.orderBy(desc(testRunEvents.createdAt));
	return rows;
}

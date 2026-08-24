import { and, asc, count, desc, eq, type SQL, sql } from "drizzle-orm";

import { db } from "../index";
import { modules } from "../schema/modules";
import { type CasePriority, testCases } from "../schema/test-cases";
import { testRunAttachments } from "../schema/test-run-attachments";
import {
	type TestRun,
	type TestRunCaseResult,
	testRunCases,
	testRuns,
} from "../schema/test-runs";
import { users } from "../schema/users";
import { getProjectSettings } from "./project-settings-repository";
import { settleAutoSubmitForRun } from "./test-run-auto-submit-repository";
import {
	computeCompletionRate,
	computePassRate,
} from "./test-run-metrics-core";
import type { TestRunResultCounts } from "./test-runs-repository";

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * 某个结论的计数。全部聚合都靠 `count(...) filter (where ...)` 一条 SQL 出，
 * **不许 N+1**：报告页要出四个大数字、按模块分布、按优先级通过率和失败清单，
 * 逐项去查就是「一个页面几十次往返」，而它们都只是同一批行的不同切法。
 */
function resultCount(result: TestRunCaseResult): SQL<number> {
	return sql<number>`count(*) filter (where ${testRunCases.result} = ${result}::test_run_case_result)`.mapWith(
		Number
	);
}

const COUNT_COLUMNS = {
	blocked: resultCount("blocked"),
	failed: resultCount("failed"),
	passed: resultCount("passed"),
	skipped: resultCount("skipped"),
	total: count(),
	untested: resultCount("untested"),
};

export interface TestRunModuleStat extends TestRunResultCounts {
	moduleId: string;
	moduleName: string;
}

export interface TestRunPriorityStat {
	failed: number;
	passed: number;
	/** 分母为 0（该优先级全是未测/阻塞/跳过）时为 null，不是 0。 */
	passRate: number | null;
	priority: CasePriority;
	total: number;
}

/** 报告页真正要交出去的东西：失败清单（plan §7.4）。 */
export interface TestRunFailedCase {
	/**
	 * 这条失败用例挂了几个附件。
	 *
	 * **只给计数，不给 URL**：签名 URL 是 15 分钟有效期的，而报告页可能被开着
	 * 一下午；一张 40 行的失败清单预签一遍就是 40 次签名，绝大多数还没人点。
	 * 有了计数，列表上「哪几行有截图」一眼可见，缩略图仍由前端按需
	 * 调 `testRunAttachments.list` 拉——那是点开时才发生的一次。
	 */
	attachmentCount: number;
	caseId: string;
	/** 失败原因。 */
	comment: string | null;
	defectKey: string | null;
	defectStatus: string | null;
	defectTitle: string | null;
	defectUrl: string | null;
	executedAt: Date | null;
	executedByName: string | null;
	moduleName: string;
	name: string;
	priority: CasePriority;
	runCaseId: string;
}

export interface TestRunReport {
	/** 生效的自动提交天数（项目未配置时为兜底默认值）。 */
	autoSubmitAfterCompletedDays: number;
	/**
	 * 预计自动提交的时刻，仅在「已完成且未提交」时有值。
	 * 报告页顶部那句「将于 X 月 X 日自动提交」就靠它（plan §7.4）。
	 */
	autoSubmitAt: Date | null;
	completionRate: number | null;
	counts: TestRunResultCounts;
	failedCases: TestRunFailedCase[];
	modules: TestRunModuleStat[];
	passRate: number | null;
	priorities: TestRunPriorityStat[];
	run: TestRun;
	/**
	 * 提交人用户名，**纯展示用的附属信息，不是判定依据**。
	 *
	 * ⚠️ **判断「是否系统自动提交」永远只看 `run.submittedBy`**（D16：
	 * `submittedAt IS NOT NULL AND submittedBy IS NULL` 是自动提交的唯一标记，
	 * 没有布尔列）。这个名字为 null 有**两种**成因：真·自动提交
	 * （`submittedBy` 本身是 null），以及 join 不到人（账号被删，外键
	 * `onDelete: "set null"`）。拿名字去判定就是把后者当成前者，
	 * 报告页会对一个明明有人提交的测试任务说「由系统自动提交」。
	 */
	submittedByName: string | null;
}

async function loadCounts(runId: string): Promise<TestRunResultCounts> {
	const [row] = await db
		.select(COUNT_COLUMNS)
		.from(testRunCases)
		.where(eq(testRunCases.runId, runId));
	return (
		row ?? {
			blocked: 0,
			failed: 0,
			passed: 0,
			skipped: 0,
			total: 0,
			untested: 0,
		}
	);
}

/** 按模块的分布：失败多的排前面，报告页第一眼就该看到「哪个模块最烂」。 */
function loadModuleStats(runId: string): Promise<TestRunModuleStat[]> {
	return db
		.select({
			...COUNT_COLUMNS,
			moduleId: modules.id,
			moduleName: modules.name,
		})
		.from(testRunCases)
		.innerJoin(testCases, eq(testCases.id, testRunCases.caseId))
		.innerJoin(modules, eq(modules.id, testCases.moduleId))
		.where(eq(testRunCases.runId, runId))
		.groupBy(modules.id, modules.name)
		.orderBy(desc(resultCount("failed")), asc(modules.name));
}

/**
 * 按优先级的通过率。**P0 有没有失败是上线红线**，所以这一项单独出，
 * 而不是让读报告的人自己去失败清单里数。
 * 排序直接按 priority 枚举列——枚举定义顺序就是 P0→P3。
 */
async function loadPriorityStats(
	runId: string
): Promise<TestRunPriorityStat[]> {
	const rows = await db
		.select({
			failed: resultCount("failed"),
			passed: resultCount("passed"),
			priority: testCases.priority,
			total: count(),
		})
		.from(testRunCases)
		.innerJoin(testCases, eq(testCases.id, testRunCases.caseId))
		.where(eq(testRunCases.runId, runId))
		.groupBy(testCases.priority)
		.orderBy(asc(testCases.priority));
	return rows.map((row) => ({ ...row, passRate: computePassRate(row) }));
}

/**
 * 失败清单。附件数走**同一条查询**里的 `count(...) + group by`，
 * 不是每条失败用例再查一次——失败用例可能有几十条，那就是几十次往返，
 * 而它们只是同一批行的另一种切法（与本文件其余聚合同一条原则）。
 *
 * `count(test_run_attachments.id)` 而不是 `count(*)`：左连接下没有附件的用例
 * 会产生一行全 null 的连接结果，`count(*)` 会把它算成 1，于是每条失败用例
 * 看起来都「有 1 个附件」。
 */
function loadFailedCases(runId: string): Promise<TestRunFailedCase[]> {
	return (
		db
			.select({
				attachmentCount: count(testRunAttachments.id),
				caseId: testCases.id,
				comment: testRunCases.comment,
				defectKey: testRunCases.defectKey,
				defectStatus: testRunCases.defectStatus,
				defectTitle: testRunCases.defectTitle,
				defectUrl: testRunCases.defectUrl,
				executedAt: testRunCases.executedAt,
				executedByName: users.username,
				moduleName: modules.name,
				name: testCases.name,
				priority: testCases.priority,
				runCaseId: testRunCases.id,
			})
			.from(testRunCases)
			.innerJoin(testCases, eq(testCases.id, testRunCases.caseId))
			.innerJoin(modules, eq(modules.id, testCases.moduleId))
			.leftJoin(users, eq(users.id, testRunCases.executedBy))
			.leftJoin(
				testRunAttachments,
				eq(testRunAttachments.runCaseId, testRunCases.id)
			)
			.where(
				and(eq(testRunCases.runId, runId), eq(testRunCases.result, "failed"))
			)
			// 分组只列四张表的主键，其余被 select 的列全靠 Postgres 的函数依赖推断
			// 放行。列成 `modules.name` / `users.username` 那样的具体列也能跑，
			// 但每加一个展示字段就得回来补一个 group by 项，迟早漏。
			.groupBy(testRunCases.id, testCases.id, modules.id, users.id)
			.orderBy(asc(testCases.priority), asc(testRunCases.sortOrder))
	);
}

function computeAutoSubmitAt(run: TestRun, days: number): Date | null {
	if (run.submittedAt !== null || run.completedAt === null) {
		return null;
	}
	return new Date(run.completedAt.getTime() + days * MILLISECONDS_PER_DAY);
}

/**
 * 报告页聚合。**全部是实时查询，没有任何快照**（plan §2.3）：
 * 追加用例、改结论之后再看，数字就跟着变，这是设计如此而不是缺陷。
 * 报告的权威性由「提交后锁死」提供（D15），不由快照提供。
 *
 * 入口第一件事是惰性结算超时自动提交——报告页本身就是最主要的访问点，
 * 用户看到的永远是已结算后的状态（plan §2.5）。
 */
export async function getTestRunReport(
	runId: string
): Promise<TestRunReport | null> {
	await settleAutoSubmitForRun(runId);
	const [row] = await db
		.select({ run: testRuns, submittedByName: users.username })
		.from(testRuns)
		.leftJoin(users, eq(users.id, testRuns.submittedBy))
		.where(eq(testRuns.id, runId))
		.limit(1);
	if (!row) {
		return null;
	}
	const [counts, moduleStats, priorities, failedCases, settings] =
		await Promise.all([
			loadCounts(runId),
			loadModuleStats(runId),
			loadPriorityStats(runId),
			loadFailedCases(runId),
			getProjectSettings(row.run.projectId),
		]);
	return {
		autoSubmitAfterCompletedDays: settings.autoSubmitAfterCompletedDays,
		autoSubmitAt: computeAutoSubmitAt(
			row.run,
			settings.autoSubmitAfterCompletedDays
		),
		completionRate: computeCompletionRate(counts),
		counts,
		failedCases,
		modules: moduleStats,
		passRate: computePassRate(counts),
		priorities,
		run: row.run,
		submittedByName: row.submittedByName,
	};
}

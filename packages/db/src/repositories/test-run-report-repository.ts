import { asc, count, desc, eq, type SQL, sql } from "drizzle-orm";

import { db } from "../index";
import { modules } from "../schema/modules";
import { type CasePriority, testCases } from "../schema/test-cases";
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
import {
	loadAutomationExecutions,
	type TestRunAutomationExecution,
} from "./test-run-report-automation";
import {
	loadFailedCases,
	type TestRunFailedCase,
} from "./test-run-report-failed-cases";
import {
	loadOutOfScopeCases,
	type TestRunOutOfScopeCase,
} from "./test-run-report-out-of-scope";
import type { TestRunResultCounts } from "./test-runs-repository";

/*
 * 报告页的三块取数各在自己的兄弟模块里：失败清单（含 §6.2 新增的 `executedVia`
 * 与 `automationExecution`）在 `test-run-report-failed-cases.ts`，执行记录块在
 * `test-run-report-automation.ts`，越界清单在 `test-run-report-out-of-scope.ts`
 * ——拆分只为让每个文件留在 300 行以内，口径一个字没改。
 *
 * 类型在这里原样 re-export：`TestRunFailedCase` 此前从本模块能取到，仍然能取到。
 */
export type { TestRunAutomationExecution } from "./test-run-report-automation";
export type {
	TestRunFailedCase,
	TestRunFailedCaseAutomation,
} from "./test-run-report-failed-cases";
export type { TestRunOutOfScopeCase } from "./test-run-report-out-of-scope";

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

export interface TestRunReport {
	/**
	 * 本任务里由脚本打下结论的条数（§6.1 顶部那行灰字「其中 N 条由脚本执行」）。
	 *
	 * **只是一行灰字**：不出卡片、不单独算率、头条数字不分栏（D26）。
	 * 它也不参与任何率的分子分母——通过率的分母仍然不含阻塞与跳过，
	 * 算法一个字没改（口径仍在 `test-run-metrics-core.ts`）。
	 */
	automatedCount: number;
	/** 自动化执行记录块（§6.3）。位置在失败清单**之后**：它是解释性材料，不是结论。 */
	automationExecutions: TestRunAutomationExecution[];
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
	/**
	 * 脚本报了、却不在任何未提交任务里的用例（§5.1.1 的 `outOfScope`）。
	 * **平台不会自动把它们追加进来**（§9），这里只把事实摆出来，追加由人点。
	 */
	outOfScopeCases: TestRunOutOfScopeCase[];
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

const EMPTY_COUNTS: TestRunResultCounts = {
	blocked: 0,
	failed: 0,
	passed: 0,
	skipped: 0,
	total: 0,
	untested: 0,
};

/**
 * 「其中 N 条由脚本执行」那行灰字的分子（§6.1）。
 *
 * 与四个大数字**同一条查询**出——它就是同一批行按来源的另一种切法，
 * 单开一条 SQL 属于本文件顶上那条禁令针对的写法。
 *
 * `executedVia` 为 null 的行（未测，以及第二期写下的历史结论）不计入：
 * 那一列的 null 是「不知道」而不是「手工」，见 schema 上的注释。
 */
const AUTOMATED_COUNT =
	sql<number>`count(*) filter (where ${testRunCases.executedVia} = 'automation')`.mapWith(
		Number
	);

async function loadCounts(
	runId: string
): Promise<{ automatedCount: number; counts: TestRunResultCounts }> {
	const [row] = await db
		.select({ ...COUNT_COLUMNS, automated: AUTOMATED_COUNT })
		.from(testRunCases)
		.where(eq(testRunCases.runId, runId));
	if (!row) {
		return { automatedCount: 0, counts: EMPTY_COUNTS };
	}
	const { automated, ...counts } = row;
	return { automatedCount: automated, counts };
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
/**
 * 一次并发拉齐报告的全部切面。
 *
 * 七条查询各自一条 SQL，**条数与用例条数、失败条数、执行轮数都无关**：
 * 本期新增的执行记录块与越界清单也是常数条（各一条），不是「每行再查一次」。
 * 失败清单新增的 `executedVia` / `automationExecution` 更是一条都没多加——
 * 它们走的是失败清单原本那条查询（§6.2 明写「走同一条查询」）。
 */
async function loadReportParts(run: TestRun) {
	const [
		countsRow,
		moduleStats,
		priorities,
		failedCases,
		automationExecutions,
		outOfScopeCases,
		settings,
	] = await Promise.all([
		loadCounts(run.id),
		loadModuleStats(run.id),
		loadPriorityStats(run.id),
		loadFailedCases(run.id),
		loadAutomationExecutions(run.id, run.name),
		loadOutOfScopeCases(run.id),
		getProjectSettings(run.projectId),
	]);
	return {
		automationExecutions,
		countsRow,
		failedCases,
		moduleStats,
		outOfScopeCases,
		priorities,
		settings,
	};
}

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
	const parts = await loadReportParts(row.run);
	const { automatedCount, counts } = parts.countsRow;
	const { autoSubmitAfterCompletedDays } = parts.settings;
	return {
		automatedCount,
		automationExecutions: parts.automationExecutions,
		autoSubmitAfterCompletedDays,
		autoSubmitAt: computeAutoSubmitAt(row.run, autoSubmitAfterCompletedDays),
		completionRate: computeCompletionRate(counts),
		counts,
		failedCases: parts.failedCases,
		modules: parts.moduleStats,
		outOfScopeCases: parts.outOfScopeCases,
		passRate: computePassRate(counts),
		priorities: parts.priorities,
		run: row.run,
		submittedByName: row.submittedByName,
	};
}

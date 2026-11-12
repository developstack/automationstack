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
import { runCaseModuleId } from "./run-case-module";
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
	loadFailedAndBlockedCases,
	type TestRunFailedAndBlockedCase,
} from "./test-run-report-failed-and-blocked-cases";
import {
	loadOutOfScopeCases,
	type TestRunOutOfScopeCase,
} from "./test-run-report-out-of-scope";
import type { TestRunResultCounts } from "./test-runs-repository";

export type { TestRunAutomationExecution } from "./test-run-report-automation";
export type {
	TestRunFailedAndBlockedCase,
	TestRunFailedAndBlockedResult,
	TestRunReportCaseAutomation,
	TestRunReportStep,
} from "./test-run-report-failed-and-blocked-cases";
export type { TestRunOutOfScopeCase } from "./test-run-report-out-of-scope";

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

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
	passRate: number | null;
	priority: CasePriority;
	total: number;
}

export interface TestRunReport {
	automatedCount: number;
	automationExecutions: TestRunAutomationExecution[];
	autoSubmitAfterCompletedDays: number;
	autoSubmitAt: Date | null;
	completionRate: number | null;
	counts: TestRunResultCounts;
	/** 失败和阻塞的用例：先列失败，再列阻塞。 */
	failedAndBlockedCases: TestRunFailedAndBlockedCase[];
	modules: TestRunModuleStat[];
	outOfScopeCases: TestRunOutOfScopeCase[];
	passRate: number | null;
	priorities: TestRunPriorityStat[];
	run: TestRun;
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

function loadModuleStats(runId: string): Promise<TestRunModuleStat[]> {
	return db
		.select({
			...COUNT_COLUMNS,
			moduleId: modules.id,
			moduleName: modules.name,
		})
		.from(testRunCases)
		.innerJoin(testCases, eq(testCases.id, testRunCases.caseId))
		.innerJoin(modules, eq(modules.id, runCaseModuleId))
		.where(eq(testRunCases.runId, runId))
		.groupBy(modules.id, modules.name)
		.orderBy(desc(resultCount("failed")), asc(modules.name));
}

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

async function loadReportParts(run: TestRun) {
	const [
		countsRow,
		moduleStats,
		priorities,
		failedAndBlockedCases,
		automationExecutions,
		outOfScopeCases,
		settings,
	] = await Promise.all([
		loadCounts(run.id),
		loadModuleStats(run.id),
		loadPriorityStats(run.id),
		loadFailedAndBlockedCases(run.id),
		loadAutomationExecutions(run.id, run.name),
		loadOutOfScopeCases(run.id),
		getProjectSettings(run.projectId),
	]);
	return {
		automationExecutions,
		countsRow,
		failedAndBlockedCases,
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
		failedAndBlockedCases: parts.failedAndBlockedCases,
		modules: parts.moduleStats,
		outOfScopeCases: parts.outOfScopeCases,
		passRate: computePassRate(counts),
		priorities: parts.priorities,
		run: row.run,
		submittedByName: row.submittedByName,
	};
}

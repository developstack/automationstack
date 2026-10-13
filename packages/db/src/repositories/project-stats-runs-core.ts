import type {
	TestRunCaseResult,
	TestRunStatus,
} from "../schema/test-run-enums";
import {
	ACTIVE_RUN_LIMIT,
	canStall,
	MS_PER_DAY,
	STALLED_RUN_DAYS,
} from "./project-stats-definitions";

export type ResultCounts = Record<TestRunCaseResult, number>;

export interface ActiveRunRow {
	counts: ResultCounts;
	createdAt: Date;
	id: string;
	lastExecutedAt: Date | null;
	name: string;
	status: TestRunStatus;
}

export interface ActiveRunSummary {
	caseCount: number;
	concludedCount: number;
	counts: ResultCounts;
	createdAt: Date;
	daysSinceLastExecution: number;
	id: string;
	name: string;
	stalled: boolean;
	status: TestRunStatus;
}

export interface ActiveRunsStats {
	runs: ActiveRunSummary[];
	stalledCount: number;
	totalCount: number;
}

export interface ActiveRunsInput {
	now: Date;
	/** 进行中的测试任务，即还没有提交的测试任务。 */
	runs: readonly ActiveRunRow[];
}

function summarize(row: ActiveRunRow, now: Date): ActiveRunSummary {
	const { counts } = row;
	const caseCount =
		counts.untested +
		counts.passed +
		counts.failed +
		counts.blocked +
		counts.skipped;
	const lastActivity = row.lastExecutedAt ?? row.createdAt;
	const idleMs = Math.max(0, now.getTime() - lastActivity.getTime());
	return {
		caseCount,
		concludedCount: caseCount - counts.untested,
		counts,
		createdAt: row.createdAt,
		daysSinceLastExecution: Math.floor(idleMs / MS_PER_DAY),
		id: row.id,
		name: row.name,
		stalled: canStall(row.status) && idleMs > STALLED_RUN_DAYS * MS_PER_DAY,
		status: row.status,
	};
}

function compareRuns(a: ActiveRunSummary, b: ActiveRunSummary): number {
	if (a.stalled !== b.stalled) {
		return a.stalled ? -1 : 1;
	}
	return b.createdAt.getTime() - a.createdAt.getTime();
}

/** M3 进行中的测试任务：每个测试任务的完成进度和距上次执行的天数，停滞的排在前面。 */
export function buildActiveRuns({
	now,
	runs,
}: ActiveRunsInput): ActiveRunsStats {
	const summaries = runs.map((row) => summarize(row, now)).sort(compareRuns);
	return {
		runs: summaries.slice(0, ACTIVE_RUN_LIMIT),
		stalledCount: summaries.filter((summary) => summary.stalled).length,
		totalCount: summaries.length,
	};
}

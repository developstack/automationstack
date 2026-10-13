import type {
	TestRunCaseResult,
	TestRunStatus,
} from "../schema/test-run-enums";
import {
	type ConcludedResult,
	isCompletedRunStatus,
	isConcluded,
	isWithinDays,
	RECENT_WINDOW_DAYS,
	TREND_BUCKET_COUNT,
	trendBucketIndex,
	trendWindows,
} from "./project-stats-definitions";

export interface CaseTrendPoint {
	created: number;
	end: Date;
	start: Date;
}

export interface CaseTrendStats {
	createdLast7Days: number;
	createdPrevious7Days: number;
	modifiedLast7Days: number;
	points: CaseTrendPoint[];
}

export interface CaseVersionTouch {
	caseId: string;
	createdAt: Date;
}

export interface CaseTrendInput {
	/** 项目中用例的创建时间，包含所有用例状态。 */
	caseCreatedAt: readonly Date[];
	/** 版本号大于 1 的版本，即内容修改。 */
	modifiedVersions: readonly CaseVersionTouch[];
	now: Date;
}

const LAST_BUCKET = TREND_BUCKET_COUNT - 1;
const PREVIOUS_BUCKET = LAST_BUCKET - 1;

/** 按 7 天区间计数。返回 12 个数，从旧到新。 */
export function countByTrendBucket(
	timestamps: readonly Date[],
	now: Date
): number[] {
	const counts = new Array<number>(TREND_BUCKET_COUNT).fill(0);
	for (const at of timestamps) {
		const index = trendBucketIndex(at, now);
		if (index !== null) {
			counts[index] = (counts[index] ?? 0) + 1;
		}
	}
	return counts;
}

function countModifiedCases(
	versions: readonly CaseVersionTouch[],
	now: Date
): number {
	const caseIds = new Set<string>();
	for (const version of versions) {
		if (isWithinDays(version.createdAt, now, RECENT_WINDOW_DAYS)) {
			caseIds.add(version.caseId);
		}
	}
	return caseIds.size;
}

/** M2 新增用例：12 个 7 天区间的新增条数、过去 7 天和前 7 天的新增、过去 7 天修改的用例条数。 */
export function buildCaseTrend({
	caseCreatedAt,
	modifiedVersions,
	now,
}: CaseTrendInput): CaseTrendStats {
	const counts = countByTrendBucket(caseCreatedAt, now);
	const points = trendWindows(now).map((window, index) => ({
		...window,
		created: counts[index] ?? 0,
	}));
	return {
		createdLast7Days: counts[LAST_BUCKET] ?? 0,
		createdPrevious7Days: counts[PREVIOUS_BUCKET] ?? 0,
		modifiedLast7Days: countModifiedCases(modifiedVersions, now),
		points,
	};
}

export type ExecutionTrendPoint = Record<ConcludedResult, number> & {
	end: Date;
	start: Date;
};

export interface ExecutionTrendStats {
	points: ExecutionTrendPoint[];
}

export interface ExecutionRow {
	executedAt: Date;
	result: TestRunCaseResult;
}

export interface ExecutionTrendInput {
	/** 测试任务中每条用例的最终执行结果和执行时间。 */
	executions: readonly ExecutionRow[];
	now: Date;
}

/** M6 每周执行结果：每个 7 天区间内有结论的执行结果，按执行结果分组计数。 */
export function buildExecutionTrend({
	executions,
	now,
}: ExecutionTrendInput): ExecutionTrendStats {
	const points: ExecutionTrendPoint[] = trendWindows(now).map((window) => ({
		...window,
		blocked: 0,
		failed: 0,
		passed: 0,
		skipped: 0,
	}));
	for (const { executedAt, result } of executions) {
		const index = trendBucketIndex(executedAt, now);
		const point = index === null ? undefined : points[index];
		if (point !== undefined && isConcluded(result)) {
			point[result] += 1;
		}
	}
	return { points };
}

export interface RunTrendPoint {
	completed: number;
	created: number;
	end: Date;
	start: Date;
}

export interface RunTrendStats {
	completedLast7Days: number;
	points: RunTrendPoint[];
}

export interface RunTrendRow {
	completedAt: Date | null;
	createdAt: Date;
	status: TestRunStatus;
}

export interface RunTrendInput {
	now: Date;
	runs: readonly RunTrendRow[];
}

/**
 * 测试任务从已完成回到测试中时 completed_at 被设为空，但为了防止旧数据，这里也检查状态。
 * 已完成和已提交的测试任务，completed_at 是最后一次进入已完成的时间。
 */
function completedTimes(runs: readonly RunTrendRow[]): Date[] {
	const times: Date[] = [];
	for (const run of runs) {
		if (run.completedAt !== null && isCompletedRunStatus(run.status)) {
			times.push(run.completedAt);
		}
	}
	return times;
}

/** M7 测试任务新建和完成趋势：每个 7 天区间新建和完成的测试任务数。 */
export function buildRunTrend({ now, runs }: RunTrendInput): RunTrendStats {
	const created = countByTrendBucket(
		runs.map((run) => run.createdAt),
		now
	);
	const completed = countByTrendBucket(completedTimes(runs), now);
	const points = trendWindows(now).map((window, index) => ({
		...window,
		completed: completed[index] ?? 0,
		created: created[index] ?? 0,
	}));
	return { completedLast7Days: completed[LAST_BUCKET] ?? 0, points };
}

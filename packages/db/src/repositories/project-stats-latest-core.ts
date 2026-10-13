import type { CasePriority } from "../schema/test-cases";
import type { TestRunCaseResult } from "../schema/test-run-enums";
import {
	type ConcludedResult,
	EXECUTION_WINDOW_DAYS,
	isConcluded,
	isHighPriority,
	isWithinDays,
} from "./project-stats-definitions";

/** 一条生效用例在一个测试任务中的最终执行结果。 */
export interface LatestResultRow {
	caseId: string;
	executedAt: Date;
	priority: CasePriority;
	result: TestRunCaseResult;
}

export interface LatestResultsStats {
	/** 过去 30 天内有结论的生效用例条数。 */
	caseCount: number;
	counts: Record<ConcludedResult, number>;
	failedOrBlockedCount: number;
	highPriorityFailedCount: number;
}

export interface LatestResultsInput {
	executions: readonly LatestResultRow[];
	now: Date;
}

type ConcludedRow = LatestResultRow & { result: ConcludedResult };

/** 每条用例在窗口内最新的有结论执行结果。执行时间相同时保留先出现的一行。 */
function latestByCase(
	executions: readonly LatestResultRow[],
	now: Date
): ConcludedRow[] {
	const latest = new Map<string, ConcludedRow>();
	for (const row of executions) {
		const { result } = row;
		if (
			!(
				isConcluded(result) &&
				isWithinDays(row.executedAt, now, EXECUTION_WINDOW_DAYS)
			)
		) {
			continue;
		}
		const previous = latest.get(row.caseId);
		if (previous === undefined || row.executedAt > previous.executedAt) {
			latest.set(row.caseId, { ...row, result });
		}
	}
	return [...latest.values()];
}

/** M5 生效用例的最新执行结果：每条用例只计算一次。 */
export function buildLatestResults({
	executions,
	now,
}: LatestResultsInput): LatestResultsStats {
	const counts: Record<ConcludedResult, number> = {
		blocked: 0,
		failed: 0,
		passed: 0,
		skipped: 0,
	};
	let highPriorityFailedCount = 0;
	const latest = latestByCase(executions, now);
	for (const row of latest) {
		counts[row.result] += 1;
		if (row.result === "failed" && isHighPriority(row.priority)) {
			highPriorityFailedCount += 1;
		}
	}
	return {
		caseCount: latest.length,
		counts,
		failedOrBlockedCount: counts.failed + counts.blocked,
		highPriorityFailedCount,
	};
}

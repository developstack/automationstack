// 项目概览的术语、时间窗口和阈值（#52 调研报告第 1 节和第 10.1 节）。
// 这个文件没有数据库依赖，前端也从这里取常量，页面上的文字和查询使用同一个值。

import type { CasePriority } from "../schema/test-cases";
import type {
	TestRunCaseResult,
	TestRunStatus,
} from "../schema/test-run-enums";

/** 有结论的执行结果：不是未测。顺序也是图例和堆叠的顺序。 */
export const CONCLUDED_RESULTS = [
	"passed",
	"failed",
	"blocked",
	"skipped",
] as const satisfies readonly TestRunCaseResult[];

export type ConcludedResult = (typeof CONCLUDED_RESULTS)[number];

export function isConcluded(
	result: TestRunCaseResult
): result is ConcludedResult {
	return result !== "untested";
}

/** 已执行：通过或失败。阻塞和跳过表示用例没有真正执行。 */
export const EXECUTED_RESULTS = [
	"passed",
	"failed",
] as const satisfies readonly TestRunCaseResult[];

const EXECUTED_RESULT_SET: ReadonlySet<TestRunCaseResult> = new Set(
	EXECUTED_RESULTS
);

export function isExecuted(result: TestRunCaseResult): boolean {
	return EXECUTED_RESULT_SET.has(result);
}

export const HIGH_PRIORITIES = [
	"P0",
	"P1",
] as const satisfies readonly CasePriority[];

const HIGH_PRIORITY_SET: ReadonlySet<CasePriority> = new Set(HIGH_PRIORITIES);

export function isHighPriority(priority: CasePriority): boolean {
	return HIGH_PRIORITY_SET.has(priority);
}

/** 可以停滞的测试任务状态：待测试、测试中。 */
export function canStall(status: TestRunStatus): boolean {
	return status === "ready" || status === "in_progress";
}

/** 算作完成的测试任务状态：已完成、已提交。 */
export function isCompletedRunStatus(status: TestRunStatus): boolean {
	return status === "completed" || status === "submitted";
}

export const MS_PER_DAY = 86_400_000;

/** 趋势图一个区间的天数。最后一个区间就是「过去 7 天」。 */
export const TREND_BUCKET_DAYS = 7;

/** 趋势图的区间个数。 */
export const TREND_BUCKET_COUNT = 12;

/** 「过去 7 天」新增、修改和完成的时间窗口，与趋势图的最后一个区间相同。 */
export const RECENT_WINDOW_DAYS = TREND_BUCKET_DAYS;

/** 草稿停留超过这个天数时，算作停留过久的草稿。 */
export const STALE_DRAFT_DAYS = 14;

/** 待测试或测试中的测试任务，超过这个天数没有新的执行结果时算作停滞。 */
export const STALLED_RUN_DAYS = 7;

/** 执行覆盖率和最新执行结果的时间窗口。 */
export const EXECUTION_WINDOW_DAYS = 30;

/** P0/P1 生效用例超过这个天数没有执行时，进入待执行列表。 */
export const UNEXECUTED_HIGH_PRIORITY_DAYS = 90;

/** 进行中的测试任务最多显示的行数。 */
export const ACTIVE_RUN_LIMIT = 5;

/** 执行覆盖率的模块条形图最多显示的第一层模块个数。 */
export const UNEXECUTED_MODULE_LIMIT = 8;

/** 过去 90 天没有执行的 P0/P1 用例最多列出的条数。 */
export const UNEXECUTED_CASE_LIMIT = 10;

export function daysBefore(now: Date, days: number): Date {
	return new Date(now.getTime() - days * MS_PER_DAY);
}

/** 第一个 7 天区间的开始时间。早于这个时间的数据不进入趋势图。 */
export function trendStart(now: Date): Date {
	return daysBefore(now, TREND_BUCKET_DAYS * TREND_BUCKET_COUNT);
}

export interface TrendWindow {
	end: Date;
	start: Date;
}

/** 12 个连续的 7 天区间，从旧到新。每个区间包含开始时间，不包含结束时间。 */
export function trendWindows(now: Date): TrendWindow[] {
	return Array.from({ length: TREND_BUCKET_COUNT }, (_, index) => {
		const daysFromStart = (TREND_BUCKET_COUNT - index) * TREND_BUCKET_DAYS;
		return {
			end: daysBefore(now, daysFromStart - TREND_BUCKET_DAYS),
			start: daysBefore(now, daysFromStart),
		};
	});
}

/**
 * 时间所在区间的下标（0 是最旧的区间）。早于第一个区间时返回 null。
 * 晚于现在的时间（服务器之间的时钟偏差）算进最后一个区间。
 */
export function trendBucketIndex(at: Date, now: Date): number | null {
	const offset = at.getTime() - trendStart(now).getTime();
	if (offset < 0) {
		return null;
	}
	const index = Math.floor(offset / (TREND_BUCKET_DAYS * MS_PER_DAY));
	return Math.min(index, TREND_BUCKET_COUNT - 1);
}

/** 时间在窗口内：不早于窗口开始。晚于现在的时间也算在窗口内。 */
export function isWithinDays(at: Date, now: Date, days: number): boolean {
	return at.getTime() >= daysBefore(now, days).getTime();
}

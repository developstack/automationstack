/**
 * 列表页的进度与通过率口径。
 *
 * 这里**不重新推导公式**：`computePassRate` 直接从 packages/db 的
 * `test-run-metrics-core.ts` 取（那是个零依赖的纯函数文件，不会把 drizzle
 * 拖进浏览器包）。该文件的注释点名了本仓库最容易犯的错——把阻塞算进通过率
 * 的分母——所以列表页与报告页必须共用同一份实现，而不是各写一遍。
 *
 * 格式化走中立的 `rate-format.ts`（不是报告页的 report-meta）：它保证
 * 「未满 100% 绝不显示 100%」，这条规则在列表页同样致命——119/120 显示成 100%
 * 会让人以为可以发版了。列表是报告的上游，反过来 import 报告页是错的依赖方向。
 */

import { computePassRate } from "@automationstack/db/repositories/test-run-metrics-core";
import type { TestRunStatus } from "@automationstack/db/schema/test-runs";

import { formatRate } from "@/components/test-runs/rate-format";

/** 列表页拿到的结论分布，字段与 `TestRunListItem["counts"]` 一致。 */
export interface RunCounts {
	blocked: number;
	failed: number;
	passed: number;
	skipped: number;
	total: number;
	untested: number;
}

/** 状态筛选下拉的选项顺序 = 状态机的推进顺序（plan §2.1）。 */
export const TEST_RUN_STATUS_VALUES: readonly TestRunStatus[] = [
	"pending_review",
	"ready",
	"in_progress",
	"completed",
	"submitted",
];

/**
 * 通过率文案。分母为 0 时是 `—` 而不是 `0%`——
 * 「不知道」和「一条都没过」在这一列里是两句完全不同的话。
 */
export function formatPassRate(counts: RunCounts): string {
	return formatRate(computePassRate(counts));
}

export interface TestRunProgress {
	/** 已有结论的条数（通过/失败/阻塞/跳过都算）。 */
	done: number;
	/** 0–1；空测试任务返回 0 而不是 NaN。 */
	ratio: number;
	total: number;
}

/**
 * 进度 = 有结论 / 总数。
 *
 * 阻塞与跳过**算进分子**：它们是「这条不用再管了」，不是「还没测」。
 * 这与通过率的分母规则正好相反，两者放在同一行里，谁也不能借用谁的口径。
 */
export function testRunProgress(counts: RunCounts): TestRunProgress {
	const done = counts.total - counts.untested;
	return {
		done,
		ratio: counts.total === 0 ? 0 : done / counts.total,
		total: counts.total,
	};
}

/** 已提交 = 终态，界面上一切写入入口都要跟着关掉（plan §2.5）。 */
export function isTestRunLocked(status: TestRunStatus): boolean {
	return status === "submitted";
}

/** 删除项禁用时给出的理由。禁用而不说明原因等于什么都没说。 */
export const TEST_RUN_LOCKED_DELETE_HINT = "已提交的报告不可删除";

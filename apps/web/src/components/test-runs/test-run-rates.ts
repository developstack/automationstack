import { computePassRate } from "@automationstack/db/repositories/test-run-metrics-core";
import type { TestRunStatus } from "@automationstack/db/schema/test-runs";

import { formatRate } from "@/components/test-runs/rate-format";

export interface RunCounts {
	blocked: number;
	failed: number;
	passed: number;
	skipped: number;
	total: number;
	untested: number;
}

export const TEST_RUN_STATUS_VALUES: readonly TestRunStatus[] = [
	"pending_review",
	"ready",
	"in_progress",
	"completed",
	"submitted",
	"voided",
];

export function formatPassRate(counts: RunCounts): string {
	return formatRate(computePassRate(counts));
}

export interface TestRunProgress {
	done: number;
	ratio: number;
	total: number;
}

export function testRunProgress(counts: RunCounts): TestRunProgress {
	const done = counts.total - counts.untested;
	return {
		done,
		ratio: counts.total === 0 ? 0 : done / counts.total,
		total: counts.total,
	};
}

/** 已提交和已作废的测试任务只读。 */
export function isTestRunLocked(status: TestRunStatus): boolean {
	return status === "submitted" || status === "voided";
}

import type { TestRun, TestRunStatus } from "../schema/test-runs";

export interface RunConclusionCounts {
	total: number;
	untested: number;
}

export function deriveRunStatusSteps(
	currentStatus: TestRunStatus,
	counts: RunConclusionCounts
): TestRunStatus[] {
	const hasCases = counts.total > 0;
	const allConcluded = hasCases && counts.untested === 0;
	const hasConclusion = counts.total - counts.untested > 0;
	if (currentStatus === "ready" && hasConclusion) {
		return allConcluded ? ["in_progress", "completed"] : ["in_progress"];
	}
	if (currentStatus === "in_progress" && allConcluded) {
		return ["completed"];
	}
	if (currentStatus === "completed" && counts.untested > 0) {
		return ["in_progress"];
	}
	return [];
}

export interface RunLocked {
	kind: "locked";
	submittedAt: Date;
}

export interface RunVoided {
	kind: "voided";
	voidedAt: Date;
}

/** 测试任务不能再写的两个原因：已提交后锁定，或已作废。两者都拒绝一切写操作。 */
export type RunWriteLock = RunLocked | RunVoided;

export interface RunWritableOk {
	kind: "ok";
	run: TestRun;
}

export type RunWritableResult =
	| RunWriteLock
	| RunWritableOk
	| { kind: "not-found" };

export function evaluateRunWritable(
	run: TestRun | undefined
): RunWritableResult {
	if (!run) {
		return { kind: "not-found" };
	}
	if (run.voidedAt !== null) {
		return { kind: "voided", voidedAt: run.voidedAt };
	}
	if (run.submittedAt !== null) {
		return { kind: "locked", submittedAt: run.submittedAt };
	}
	return { kind: "ok", run };
}

const VOIDABLE_RUN_STATUSES: ReadonlySet<TestRunStatus> = new Set([
	"pending_review",
	"ready",
	"in_progress",
]);

/** 待评审、待测试、测试中的测试任务可以作废；已完成、已提交的不能。服务端和 web 共用这条规则。 */
export function isTestRunVoidable(status: TestRunStatus): boolean {
	return VOIDABLE_RUN_STATUSES.has(status);
}

export type VoidTestRunRejection =
	| RunVoided
	| { kind: "invalid-status"; status: TestRunStatus }
	| { kind: "not-found" };

export function evaluateRunVoidable(
	run: TestRun | undefined
): RunWritableOk | VoidTestRunRejection {
	if (!run) {
		return { kind: "not-found" };
	}
	// 作废是终态：已作废的测试任务按写锁拒绝，不能再作废一次。
	if (run.voidedAt !== null) {
		return { kind: "voided", voidedAt: run.voidedAt };
	}
	if (!isTestRunVoidable(run.status)) {
		return { kind: "invalid-status", status: run.status };
	}
	return { kind: "ok", run };
}

export interface SubmitAlreadySubmitted {
	kind: "already-submitted";
	run: TestRun;
}

export type SubmitTestRunRejection =
	| RunVoided
	| SubmitAlreadySubmitted
	| { kind: "invalid-status"; status: TestRunStatus }
	| { kind: "not-found" };

export type SubmitTestRunResult =
	| SubmitTestRunRejection
	| { kind: "submitted"; run: TestRun };

export function classifySubmitRejection(
	run: TestRun | undefined
): SubmitTestRunRejection {
	if (!run) {
		return { kind: "not-found" };
	}
	if (run.voidedAt !== null) {
		return { kind: "voided", voidedAt: run.voidedAt };
	}
	if (run.submittedAt !== null) {
		return { kind: "already-submitted", run };
	}
	return { kind: "invalid-status", status: run.status };
}

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

export interface RunWritableOk {
	kind: "ok";
	run: TestRun;
}

export type RunWritableResult =
	| RunLocked
	| RunWritableOk
	| { kind: "not-found" };

export function evaluateRunWritable(
	run: TestRun | undefined
): RunWritableResult {
	if (!run) {
		return { kind: "not-found" };
	}
	if (run.submittedAt !== null) {
		return { kind: "locked", submittedAt: run.submittedAt };
	}
	return { kind: "ok", run };
}

export interface SubmitAlreadySubmitted {
	kind: "already-submitted";
	run: TestRun;
}

export type SubmitTestRunRejection =
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
	if (run.submittedAt !== null) {
		return { kind: "already-submitted", run };
	}
	return { kind: "invalid-status", status: run.status };
}

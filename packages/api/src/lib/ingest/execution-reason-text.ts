import type { SubmittedRunBlocker } from "@automationstack/db/repositories/automation-ingest-repository";
import type { ApplyAutomationVerdictsOutcome } from "@automationstack/db/repositories/test-run-verdicts-repository";

export const REASON_UNMATCHED = "项目里没有这个 sourceRef 的用例";
export const REASON_NO_CANDIDATE_RUN = "不在任何未提交任务的范围内";
export const REASON_SKIPPED_MANUAL = "已有人工结论";

export function describePendingReview(runName: string): string {
	return `测试任务「${runName}」还在待评审，不接受结论`;
}

export function describeRunIdsExcluded(runName: string): string {
	return `测试任务「${runName}」是这条用例的候选（未提交），但本轮的 runIds 白名单没有带上它，结论未写入`;
}

export function describeSubmittedBlocker(blocker: SubmittedRunBlocker): string {
	return `收这条用例的测试任务都已提交并锁定（最近的一个是「${blocker.runName}」，提交于 ${blocker.submittedAt.toLocaleString("zh-CN")}），本轮结论未写入；要重测请新建测试任务`;
}

export function describeRunWriteRejection(
	rejection: Exclude<ApplyAutomationVerdictsOutcome, { kind: "ok" }>,
	runName: string
): string {
	if (rejection.kind === "locked") {
		return `测试任务「${runName}」已于 ${rejection.submittedAt.toLocaleString("zh-CN")} 提交并锁定，本轮结论未写入`;
	}
	if (rejection.kind === "voided") {
		return `测试任务「${runName}」已作废，本轮结论未写入`;
	}
	if (rejection.kind === "review-pending") {
		return describePendingReview(runName);
	}
	if (rejection.kind === "invalid-run-cases") {
		return `测试任务「${runName}」的用例范围在写入前被改动，本轮结论未写入，请重跑`;
	}
	return `测试任务「${runName}」已不存在，本轮结论未写入`;
}

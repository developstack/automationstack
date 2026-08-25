import type { SubmittedRunBlocker } from "@automationstack/db/repositories/automation-ingest-repository";
import type { ApplyAutomationVerdictsOutcome } from "@automationstack/db/repositories/test-run-verdicts-repository";

/**
 * 对账单里每一句**给人看的理由**（plan §5.1.1 / §5.8）。
 *
 * 单独成文件是因为这些话的读者是人不是代码：每一句对应一个「接下来该改什么」，
 * 而它们最贵的性质是**彼此不许合并**——落空的几种原因分别把人推向改
 * `AS_PROJECT`、把用例勾进任务、改 CI 的 `runIds` 白名单、新建重测任务；
 * 揉成一句「不在任何未提交任务的范围内」就是平台对着人说一句听上去自信、
 * 实际是假的解释。挑哪一句是分桶的事（`./execution-write-plan` 与
 * `./execution-reconcile`），这里只管那句话本身长什么样。
 *
 * 与 `./execution-reconcile` 一样必须保持纯：两条 db import 全是 `import type`
 * （编译期擦除），理由见那边的文件头。
 */

export const REASON_UNMATCHED = "项目里没有这个 sourceRef 的用例";
export const REASON_NO_CANDIDATE_RUN = "不在任何未提交任务的范围内";
export const REASON_SKIPPED_MANUAL = "已有人工结论";

export function describePendingReview(runName: string): string {
	return `测试任务「${runName}」还在待评审，不接受结论`;
}

/**
 * 「这个任务是候选，但你这轮的 `runIds` 没带它」。
 *
 * 与 `REASON_NO_CANDIDATE_RUN` **必须是两句不同的话**：那一句会把人推向
 * 「去某个任务里追加这条用例」（D24），而这里真正该改的是 CI 里的白名单——
 * 任务是现成的、也确实是未提交的候选，只是这一轮自己把它排除了。
 * 所以理由里点名任务，否则人只知道「被白名单挡了」，仍然不知道该往里加哪个 id。
 */
export function describeRunIdsExcluded(runName: string): string {
	return `测试任务「${runName}」是这条用例的候选（未提交），但本轮的 runIds 白名单没有带上它，结论未写入`;
}

/**
 * 「收它的任务都已经提交了」。
 *
 * 同样不能退回 `REASON_NO_CANDIDATE_RUN`：那句话让人去建任务勾用例，
 * 而真相是「上一轮的任务已经交卷了，要重测请新建一个重测任务」。
 * 点名任务与提交时间，人才知道自己看到的是不是刚刚那一轮。
 */
export function describeSubmittedBlocker(blocker: SubmittedRunBlocker): string {
	return `收这条用例的测试任务都已提交并锁定（最近的一个是「${blocker.runName}」，提交于 ${blocker.submittedAt.toLocaleString("zh-CN")}），本轮结论未写入；要重测请新建测试任务`;
}

/**
 * 某个任务整组写失败时的说明（§5.8 后两行）。
 *
 * **局部失败不让整批失败**：一次上报横跨三个任务，其中一个刚被人提交，
 * 不该拖累第三个——第三个任务里那些结论是真的，凭什么因为无关任务的状态丢掉。
 * 所以这里把类型化拒绝翻成一句人话，整组进 `outOfScope`，其余任务照常写、
 * 照常发实时事件。
 */
export function describeRunWriteRejection(
	rejection: Exclude<ApplyAutomationVerdictsOutcome, { kind: "ok" }>,
	runName: string
): string {
	if (rejection.kind === "locked") {
		return `测试任务「${runName}」已于 ${rejection.submittedAt.toLocaleString("zh-CN")} 提交并锁定，本轮结论未写入`;
	}
	if (rejection.kind === "review-pending") {
		return describePendingReview(runName);
	}
	if (rejection.kind === "invalid-run-cases") {
		return `测试任务「${runName}」的用例范围在写入前被改动，本轮结论未写入，请重跑`;
	}
	return `测试任务「${runName}」已不存在，本轮结论未写入`;
}

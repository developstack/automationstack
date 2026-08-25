import type {
	AutomationTargetRow,
	SubmittedRunBlocker,
} from "@automationstack/db/repositories/automation-ingest-repository";

import type {
	IngestOutOfScopeEntry,
	IngestSkippedManualEntry,
	IngestWrittenToEntry,
} from "./execution-contract";
import {
	describeSubmittedBlocker,
	REASON_NO_CANDIDATE_RUN,
	REASON_SKIPPED_MANUAL,
} from "./execution-reason-text";
import type {
	AutomationWriteGroup,
	UnexplainedSourceRef,
} from "./execution-write-plan";

/**
 * 写入**之后**才知道答案的那几类对账单条目（plan §5.1.1 / §5.8）。
 *
 * 与 `./execution-reconcile` 的分界是时间而不是主题：那边只看查询结果就能定案，
 * 这里的四类要等诊断查询回来（`buildUnexplainedOutOfScopeEntries`）或等事务
 * 跑完（`buildSkippedManualEntries` / `buildGroupOutOfScopeEntries` /
 * `buildWrittenToEntry`）。编排层（`./execution-ingest`）负责发那些 SQL，
 * 把结果原样递进来，于是本文件仍然是纯的、可单测的（db import 全是
 * `import type`，编译期擦除）。
 */

/**
 * 落空且没有任何具体任务能解释的那几条 → 最终的 `outOfScope` 条目。
 *
 * 两种结局，**必须分开说**（合并回一句「不在任何未提交任务的范围内」正是本函数
 * 存在的原因）：
 * - 诊断查到了已提交的任务 → 说出是哪个、什么时候提交的，人该去新建重测任务；
 * - 什么都没查到 → 真的没有任何任务收它，人该去把用例勾进某个任务（D24）。
 *
 * ⚠️ `blockers` 只用来拼这句话，**绝不参与任何写入判定**：已提交的任务永远不是
 * 候选（§3.7 / §5.3），`findSubmittedRunBlockers` 的签名里连 runId 都不给，
 * 就是为了让「顺手往那儿写一条」做不到。
 */
export function buildUnexplainedOutOfScopeEntries(
	unexplained: UnexplainedSourceRef[],
	blockers: SubmittedRunBlocker[]
): IngestOutOfScopeEntry[] {
	const blockerBySourceRef = new Map(
		blockers.map((blocker) => [blocker.sourceRef, blocker] as const)
	);
	return unexplained.map((entry) => {
		const blocker = blockerBySourceRef.get(entry.sourceRef);
		if (blocker === undefined) {
			return {
				caseId: entry.caseId,
				reason: REASON_NO_CANDIDATE_RUN,
				runName: null,
				sourceRef: entry.sourceRef,
			};
		}
		return {
			caseId: entry.caseId,
			reason: describeSubmittedBlocker(blocker),
			runName: blocker.runName,
			sourceRef: entry.sourceRef,
		};
	});
}

/**
 * `applyAutomationVerdicts` 返回的 `skippedRunCaseIds` → 对账单里的 `skippedManual`。
 *
 * 带 `runName` 是硬要求（§5.1.1）：同一条 sourceRef 可能在 A 任务写成功、
 * 在 B 任务被人工结论挡下（D23 按行生效），不指名任务的对账单看上去自相矛盾。
 */
export function buildSkippedManualEntries(
	group: AutomationWriteGroup,
	skippedRunCaseIds: string[]
): IngestSkippedManualEntry[] {
	if (skippedRunCaseIds.length === 0) {
		return [];
	}
	const sourceRefByRunCaseId = new Map(
		group.items.map((item) => [item.runCaseId, item.sourceRef] as const)
	);
	const entries: IngestSkippedManualEntry[] = [];
	for (const runCaseId of skippedRunCaseIds) {
		const sourceRef = sourceRefByRunCaseId.get(runCaseId);
		// 理论上不可能：这批 id 就是我们自己传下去的。真出现了也只是这一条在
		// 对账单里缺席，不值得为它把整轮打成错误。
		if (sourceRef === undefined) {
			continue;
		}
		entries.push({
			reason: REASON_SKIPPED_MANUAL,
			runName: group.runName,
			sourceRef,
		});
	}
	return entries;
}

/** 整组被拒时逐条落到 `outOfScope`——绝不静默丢弃，SDK 要原样打印。 */
export function buildGroupOutOfScopeEntries(
	group: AutomationWriteGroup,
	caseIdBySourceRef: Map<string, string>,
	reason: string
): IngestOutOfScopeEntry[] {
	const entries: IngestOutOfScopeEntry[] = [];
	for (const item of group.items) {
		const caseId = caseIdBySourceRef.get(item.sourceRef);
		if (caseId === undefined) {
			continue;
		}
		entries.push({
			caseId,
			reason,
			runName: group.runName,
			sourceRef: item.sourceRef,
		});
	}
	return entries;
}

/** `sourceRef → caseId`，供整组被拒时回填 `outOfScope.caseId`（D24 的一键追加要它）。 */
export function buildCaseIdBySourceRef(
	rows: AutomationTargetRow[]
): Map<string, string> {
	return new Map(rows.map((row) => [row.sourceRef, row.caseId] as const));
}

/**
 * 写成功的一组 → `writtenTo` 一行。**`updated` 为 0 的组不进对账单**：
 * 那个任务确实一条都没被写（整组撞上人工结论），列出来会让 D34 的
 * 「一次上报写进了三个任务，日志里就得有三行」变成数不清的三行。
 * 这也让 `writtenTo` 与 §5.2 那条缓存路径（`summarizeAutomationExecutionRuns`
 * 按 `lastAutomationExecutionId` 反查，天然只数真被写过的行）口径一致。
 */
export function buildWrittenToEntry(
	group: AutomationWriteGroup,
	updatedCount: number
): IngestWrittenToEntry | null {
	if (updatedCount === 0) {
		return null;
	}
	return { runId: group.runId, runName: group.runName, updated: updatedCount };
}

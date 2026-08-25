import { applyAutomationVerdicts } from "@automationstack/db/repositories/test-run-verdicts-repository";
import type { User } from "@automationstack/db/schema/users";

import type { RealtimeActor } from "../../realtime/protocol";
import { publishInvalidateAs } from "../realtime-publish";
import type {
	IngestOutOfScopeEntry,
	IngestSkippedManualEntry,
	IngestWrittenToEntry,
} from "./execution-contract";
import {
	type AutomationWriteGroup,
	buildGroupOutOfScopeEntries,
	buildSkippedManualEntries,
	buildWrittenToEntry,
	describeRunWriteRejection,
} from "./execution-reconcile";

/**
 * 把分好组的结论真正写进去，一组一个事务（plan §5.3 / §5.5 / §5.7 / §5.8）。
 *
 * ⚠️ 这里是 **D22 红线的唯一出口**：整个 `packages/api` 只有 `applyAutomationVerdicts`
 * 一个入口能改 `test_run_cases.result`，理由（`submitted` 拒收、待评审拒收、
 * `ready → in_progress → completed` 自动流转、审计流水四件事全挂在它身上）
 * 写在 `./execution-ingest` 的文件头。本文件 import 了 db repository，
 * **因此不可单测**；所有会写错的判断都在 `./execution-reconcile` 那一侧。
 */

/**
 * 上报触发的实时事件用「token 主人」的名字署名，clientId 却是固定串。
 *
 * 名字是真人：执行台上看到的是「张三」跑了脚本，不是一个没人认识的「系统」。
 * clientId 固定成一个不可能与真实客户端相同的值（真实的是每 Tab 一个 uuid），
 * 于是没有任何在线页面会把这条事件当成「自己触发的」而跳过刷新——
 * 张三自己开着的那个页面同样要跳数字，因为触发者是他机器上的脚本，不是那个页面。
 * 与 `webhook-handler.ts` 的 `JIRA_ACTOR` 同一套理由。
 */
export function ingestActor(user: User): RealtimeActor {
	return { clientId: "automation-ingest", name: user.username };
}

export interface WriteGroupsInput {
	actor: RealtimeActor;
	caseIdBySourceRef: Map<string, string>;
	executionId: string;
	groups: AutomationWriteGroup[];
	overwriteManual: boolean;
	projectId: string;
	userId: string;
}

export interface WriteGroupsOutput {
	outOfScope: IngestOutOfScopeEntry[];
	skippedManual: IngestSkippedManualEntry[];
	writtenTo: IngestWrittenToEntry[];
}

/**
 * 每个候选任务一个事务，串行（§5.3 / §5.5）。
 *
 * **串行是要求，不是疏漏**：`ensureRunWritable` 对 `test_runs` 行加 `FOR UPDATE`，
 * 并发发出去就是多把行锁按不确定顺序抢，两个 suite 同时上报立刻互相干等。
 * N 现实里是 1～3。
 *
 * **局部失败不让整批失败**（§5.8）：某个任务还在评审、或刚被人提交，
 * 只有那一组进 `outOfScope`，其余任务照常写、照常发实时事件。
 * 第三个任务里那些结论是真的，凭什么因为无关任务的状态丢掉。
 *
 * 反过来，**非类型化的异常（连不上库、SQL 报错）故意不接住**：接住会让
 * `completeAutomationExecution` 带着残缺的计数把这一轮标成已完成，
 * 之后同键重试会走进「返回缓存对账单」那条路，剩下的任务永远写不进去。
 * 让它抛出去，那一行的 `completedAt` 停在 null，重试时整轮重跑——
 * 重放是安全的（同一个 `(runCaseId, result)` 再写一次，
 * `buildRunCaseEventRows` 因 `fromResult === toResult` 返回空数组）。
 */
export async function writeGroups(
	input: WriteGroupsInput
): Promise<WriteGroupsOutput> {
	const outOfScope: IngestOutOfScopeEntry[] = [];
	const skippedManual: IngestSkippedManualEntry[] = [];
	const writtenTo: IngestWrittenToEntry[] = [];
	for (const group of input.groups) {
		// 每组是一个独立事务，且 `ensureRunWritable` 在 `test_runs` 行上加
		// `FOR UPDATE`——并发发出去就是按不确定顺序抢多把行锁，两个 suite
		// 同时上报会互相死等（§5.3）。N 现实里是 1～3，串行没有性能问题。
		// biome-ignore lint/performance/noAwaitInLoops: 每组一个事务，必须串行抢行锁，见上
		const outcome = await applyAutomationVerdicts({
			actorId: input.userId,
			executionId: input.executionId,
			items: group.items,
			overwriteManual: input.overwriteManual,
			runId: group.runId,
		});
		if (outcome.kind !== "ok") {
			outOfScope.push(
				...buildGroupOutOfScopeEntries(
					group,
					input.caseIdBySourceRef,
					describeRunWriteRejection(outcome, group.runName)
				)
			);
			continue;
		}
		skippedManual.push(
			...buildSkippedManualEntries(group, outcome.skippedRunCaseIds)
		);
		const entry = buildWrittenToEntry(group, outcome.updatedRunCaseIds.length);
		if (entry === null) {
			continue;
		}
		writtenTo.push(entry);
		// §5.7：**每个被写入的任务各发一条**。横跨三个任务就是三条——
		// 漏发其中一条的表现是「有人的页面永远停在旧数字」，而这种 bug
		// 只有恰好开着那个任务页面的人才碰得到。
		publishInvalidateAs({
			action: "update",
			actor: input.actor,
			entity: "testRun",
			ids: [entry.runId],
			projectId: input.projectId,
		});
	}
	return { outOfScope, skippedManual, writtenTo };
}

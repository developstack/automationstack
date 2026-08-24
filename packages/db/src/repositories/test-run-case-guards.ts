import { and, eq, inArray } from "drizzle-orm";

import { testRunCases } from "../schema/test-runs";
import type { DbTransaction } from "./repository-types";
import type { RunCaseVerdictSnapshot } from "./test-run-case-events-core";
import type { RunLocked } from "./test-run-status-core";

/**
 * run_case 写路径共用的**拒绝类型与前置校验**。
 *
 * 抽出来是因为「范围与指派」（`test-run-cases-repository.ts`）和
 * 「打结论」（`test-run-verdicts-repository.ts`）两条写路径的拒绝语义必须完全一致：
 * 同一个 `kind` 在两边表示同一件事，router 才能只写一套映射
 * （见 `packages/api/src/lib/test-run-errors.ts`）。各写各的迟早会漂。
 */

/**
 * 所有 run_case 写操作共有的两种拒绝：测试任务不存在、测试任务已提交锁死。
 * 后者由 `ensureRunWritable` 在**同一个事务、同一把行锁**之下判定（plan §4.2）。
 */
export type RunCaseWriteRejection = RunLocked | { kind: "not-found" };

/**
 * 测试任务还在「待评审」，不接受结论（plan §7.3）。
 *
 * 拦在 repository 而不是只靠前端禁用控件：评审态下打结论会让状态推导陷入
 * 一个说不通的位置——`pending_review → in_progress` 不是状态机里的流转（D4 规定
 * 评审由人工签字推进），于是测试任务会留在「待评审」却已经有结论，界面上的
 * 「评审完成」按钮和已有结论互相矛盾。
 */
export interface RunReviewPending {
	kind: "review-pending";
}

/** 传进来的 run_case 不属于这个测试任务（或已被删）。整批拒绝，不静默丢弃。 */
export interface InvalidRunCases {
	invalidRunCaseIds: string[];
	kind: "invalid-run-cases";
}

export function dedupe(ids: string[]): string[] {
	return [...new Set(ids)];
}

/**
 * 校验这批 run_case 确实属于这个测试任务，**在任何修改之前**。
 *
 * 「先改再检查」在事务里也能靠回滚兜住，但要靠抛异常来回滚，
 * 而这是可预期的业务分支，不该走异常通道（本包的类型化返回约定）。
 */
export async function findInvalidRunCaseIds(
	tx: DbTransaction,
	runId: string,
	runCaseIds: string[]
): Promise<string[]> {
	if (runCaseIds.length === 0) {
		return [];
	}
	const rows = await tx
		.select({ id: testRunCases.id })
		.from(testRunCases)
		.where(
			and(eq(testRunCases.runId, runId), inArray(testRunCases.id, runCaseIds))
		);
	const owned = new Set(rows.map((row) => row.id));
	return runCaseIds.filter((id) => !owned.has(id));
}

/**
 * 与 `findInvalidRunCaseIds` **同一次查询、同一套 WHERE**，只是多带回旧结论与旧说明。
 *
 * 批量打结论既要拒绝不属于本测试任务的行，又要拿变更前的值去记审计流水
 * （见 `test-run-case-events-core.ts`）。两件事问的是同一批行，分成两条 SELECT
 * 会在执行台最热的那条路径上白白多一次往返；而把它放在这里、紧挨着
 * `findInvalidRunCaseIds`，是为了让「什么叫不属于这个测试任务」永远只有一处定义。
 *
 * ⚠️ 必须在 UPDATE **之前**调用：拿到的旧值是流水里 `fromResult` 的唯一来源，
 * 改完再查只会查回刚写进去的新值，整条时间线会变成一串 `passed → passed`。
 */
export async function selectRunCaseVerdictSnapshots(
	tx: DbTransaction,
	runId: string,
	runCaseIds: string[]
): Promise<RunCaseVerdictSnapshot[]> {
	if (runCaseIds.length === 0) {
		return [];
	}
	return await tx
		.select({
			comment: testRunCases.comment,
			id: testRunCases.id,
			result: testRunCases.result,
		})
		.from(testRunCases)
		.where(
			and(eq(testRunCases.runId, runId), inArray(testRunCases.id, runCaseIds))
		);
}

/** 快照查询的副产物：这批 id 里没被查回来的，就是不属于该测试任务的。 */
export function findMissingRunCaseIds(
	runCaseIds: string[],
	snapshots: RunCaseVerdictSnapshot[]
): string[] {
	const owned = new Set(snapshots.map((snapshot) => snapshot.id));
	return runCaseIds.filter((id) => !owned.has(id));
}

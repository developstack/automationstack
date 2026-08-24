import { and, eq, isNull, type SQL, sql } from "drizzle-orm";

import { db } from "../index";
import {
	DEFAULT_AUTO_SUBMIT_AFTER_COMPLETED_DAYS,
	projectSettings,
} from "../schema/project-settings";
import { testRunEvents } from "../schema/test-run-events";
import { testRuns } from "../schema/test-runs";
import type { DbTransaction } from "./repository-types";

/**
 * 超时自动提交的惰性结算（plan §2.5 / §4.2）。
 *
 * 单独成文件是因为它与 `test-run-transitions-repository.ts` 里的人工流转
 * 只是「都改了 status」这一点相同，其余全不同：它由**读路径**触发、没有操作人
 * （`submittedBy` 留 null 正是自动提交的唯一标记，D16）、天然幂等，
 * 而且是本包唯一一处写路径之外还会改状态的地方。
 *
 * 读路径惰性结算仍是第一层防御（有人看时秒级生效）；本文件的
 * `settleAutoSubmitAll()` 服务于 pg-boss 每日定时扫描（plan 011），兜住
 * 「零访问则状态永远不翻」的盲区。两层并发安全：幂等 UPDATE 谁先到谁赢，
 * 输者更新 0 行。事件写入、`submittedBy=null` 语义全部复用同一实现。
 */

const AUTO_SUBMIT_REASON = "完成后超过设定天数未手动提交，系统自动提交";

/**
 * 超时自动提交的惰性结算（plan §2.5 / §4.2）：**没有定时任务**，
 * 在列表 / 详情 / 报告的读路径入口就地把到期的测试任务锁死。
 *
 * 三个要点：
 * - 天数取自项目设置，**无行时兜底默认值**——设置行是懒创建的，
 *   绝大多数项目根本没有行，这个 coalesce 才是常态分支而不是边界分支。
 * - `submittedBy` 留 null：这是区分「张三确认过」和「没人管，到期自己锁的」的
 *   **唯一**依据（D16），不加 boolean 列。
 * - `WHERE submitted_at IS NULL` 让它天然幂等：三个人同时打开报告页，
 *   只有一个事务会更新到行，另外两个更新 0 行、什么都不做。
 */
async function settleAutoSubmit(
	tx: DbTransaction,
	scope: SQL
): Promise<string[]> {
	const rows = await tx
		.update(testRuns)
		.set({ status: "submitted", submittedAt: sql`now()` })
		.where(
			and(
				scope,
				eq(testRuns.status, "completed"),
				isNull(testRuns.submittedAt),
				sql`${testRuns.completedAt} < now() - (coalesce((select ${projectSettings.autoSubmitAfterCompletedDays} from ${projectSettings} where ${projectSettings.projectId} = ${testRuns.projectId}), ${DEFAULT_AUTO_SUBMIT_AFTER_COMPLETED_DAYS}) || ' days')::interval`
			)
		)
		.returning({ id: testRuns.id });
	if (rows.length > 0) {
		await tx.insert(testRunEvents).values(
			rows.map((row) => ({
				actorId: null,
				fromStatus: "completed" as const,
				reason: AUTO_SUBMIT_REASON,
				runId: row.id,
				toStatus: "submitted" as const,
			}))
		);
	}
	return rows.map((row) => row.id);
}

/** 列表页入口的惰性结算：整个项目扫一遍。返回本次被自动提交的测试任务 id。 */
export function settleAutoSubmitForProject(
	projectId: string
): Promise<string[]> {
	return db.transaction((tx) =>
		settleAutoSubmit(tx, eq(testRuns.projectId, projectId))
	);
}

/** 详情页 / 报告页入口的惰性结算：只结算当前这一个测试任务。 */
export function settleAutoSubmitForRun(runId: string): Promise<string[]> {
	return db.transaction((tx) => settleAutoSubmit(tx, eq(testRuns.id, runId)));
}

/**
 * 全局结算入口：pg-boss 每日扫描调用（plan 011 D1），无 scope 全表扫一遍。
 * 判定条件在执行时从当前数据现算，重测退回 / 改天数天然免疫，无需取消逻辑。
 */
export function settleAutoSubmitAll(): Promise<string[]> {
	return db.transaction((tx) => settleAutoSubmit(tx, sql`true`));
}

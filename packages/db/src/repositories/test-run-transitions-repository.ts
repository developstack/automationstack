import { and, eq, isNull } from "drizzle-orm";

import { db } from "../index";
import { testRunEvents } from "../schema/test-run-events";
import {
	type TestRun,
	type TestRunStatus,
	testRuns,
} from "../schema/test-runs";
import {
	classifySubmitRejection,
	type RunLocked,
	type SubmitTestRunResult,
} from "./test-run-status-core";
import {
	countRunConclusions,
	ensureRunWritable,
} from "./test-run-status-repository";

/**
 * 状态机里**由人推进**的三条流转（plan §2.1 / D4 / D15）：
 * 评审完成、撤销评审、提交报告。
 *
 * `in_progress` / `completed` 不在这里——它们由 `applyRunStatusDerivation`
 * 在打结论的同一事务里自动推导，刻意不给手动入口：手动状态和结果统计一旦能
 * 各走各的，就必然对不上（见 `schema/test-runs.ts` 的状态机注释）。
 */

export interface RunStatusActionInput {
	actorId: string | null;
	runId: string;
}

export type MarkReviewedResult =
	| RunLocked
	| { kind: "invalid-status"; status: TestRunStatus }
	| { kind: "not-found" }
	| { kind: "ok"; run: TestRun };

/**
 * 「评审完成」：`pending_review → ready`，人工推进（D4：评审在线下开会完成，
 * 平台只记谁签的字）。
 */
export function markTestRunReviewed(
	input: RunStatusActionInput
): Promise<MarkReviewedResult> {
	return db.transaction(async (tx) => {
		const writable = await ensureRunWritable(tx, input.runId);
		if (writable.kind !== "ok") {
			return writable;
		}
		const { run } = writable;
		if (run.status !== "pending_review") {
			return { kind: "invalid-status" as const, status: run.status };
		}
		const now = new Date();
		const [updated] = await tx
			.update(testRuns)
			.set({ reviewedAt: now, reviewedBy: input.actorId, status: "ready" })
			.where(eq(testRuns.id, run.id))
			.returning();
		if (!updated) {
			throw new Error("markTestRunReviewed: update returned no row");
		}
		await tx.insert(testRunEvents).values({
			actorId: input.actorId,
			fromStatus: "pending_review",
			runId: run.id,
			toStatus: "ready",
		});
		return { kind: "ok" as const, run: updated };
	});
}

export type UnmarkReviewedResult =
	| MarkReviewedResult
	/**
	 * ⚠️ **当前不可达，是刻意留下的防御分支，不是没写完**（别费劲去测试里构造它）。
	 *
	 * 只要打了一条结论，状态推导就已经把测试任务从 `ready` 推到了 `in_progress`，
	 * 于是撤销评审在下面先撞上 `status !== "ready"`，返回的是 `invalid-status`。
	 * 两条路给用户的结果一样（都是拒绝），留着它是因为将来推导规则一旦变化
	 * （比如出现「ready 也能挂结论」的场景），这道检查就是唯一挡住
	 * 「清单在执行人脚下被换掉」的东西，而它的成本只有几行。
	 */
	| { concludedCount: number; kind: "has-results" };

/**
 * 撤销评审：`ready → pending_review`，**仅当该测试任务零条结论时允许**（plan §2.1）。
 *
 * 打了第一条就不能退，因为退回评审态意味着「可以增删用例」，
 * 而此刻已经有人在按这份清单测了——清单在脚下被换掉是最难排查的一类混乱。
 * 已经开测的测试任务要改范围，用 `addCases` / `removeCases` 即可，无须退状态。
 */
export function unmarkTestRunReviewed(
	input: RunStatusActionInput
): Promise<UnmarkReviewedResult> {
	return db.transaction(async (tx) => {
		const writable = await ensureRunWritable(tx, input.runId);
		if (writable.kind !== "ok") {
			return writable;
		}
		const { run } = writable;
		if (run.status !== "ready") {
			return { kind: "invalid-status" as const, status: run.status };
		}
		const counts = await countRunConclusions(tx, run.id);
		const concludedCount = counts.total - counts.untested;
		// 见 `UnmarkReviewedResult` 上的说明：正常推导下 ready 必然零结论，
		// 这个分支进不去，留作推导规则变更时的兜底。
		if (concludedCount > 0) {
			return { concludedCount, kind: "has-results" as const };
		}
		const [updated] = await tx
			.update(testRuns)
			.set({ reviewedAt: null, reviewedBy: null, status: "pending_review" })
			.where(eq(testRuns.id, run.id))
			.returning();
		if (!updated) {
			throw new Error("unmarkTestRunReviewed: update returned no row");
		}
		await tx.insert(testRunEvents).values({
			actorId: input.actorId,
			fromStatus: "ready",
			runId: run.id,
			toStatus: "pending_review",
		});
		return { kind: "ok" as const, run: updated };
	});
}

/**
 * 「提交报告」：`completed → submitted`，终态，无解锁路径（D15）。
 *
 * 判定完全交给这一条带条件的 UPDATE，而不是「先 select 看状态，再 update」：
 * 后者在两个人同时点提交时会两次都通过检查，于是 `submittedBy` 取决于谁后写，
 * 事件表里还会多出一条重复流转。条件 UPDATE 让数据库来仲裁，
 * 只有一个事务能更新到行，另一个更新 0 行——那不是错误，是「已经有人提交了」。
 */
export function submitTestRun(
	input: RunStatusActionInput
): Promise<SubmitTestRunResult> {
	return db.transaction(async (tx) => {
		const [updated] = await tx
			.update(testRuns)
			.set({
				status: "submitted",
				submittedAt: new Date(),
				submittedBy: input.actorId,
			})
			.where(
				and(
					eq(testRuns.id, input.runId),
					eq(testRuns.status, "completed"),
					isNull(testRuns.submittedAt)
				)
			)
			.returning();
		if (!updated) {
			const [run] = await tx
				.select()
				.from(testRuns)
				.where(eq(testRuns.id, input.runId))
				.limit(1);
			return classifySubmitRejection(run);
		}
		await tx.insert(testRunEvents).values({
			actorId: input.actorId,
			fromStatus: "completed",
			runId: updated.id,
			toStatus: "submitted",
		});
		return { kind: "submitted" as const, run: updated };
	});
}

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
	evaluateRunVoidable,
	type RunWriteLock,
	type SubmitTestRunResult,
	type VoidTestRunRejection,
} from "./test-run-status-core";
import {
	countRunConclusions,
	ensureRunWritable,
	lockTestRun,
} from "./test-run-status-repository";

export interface RunStatusActionInput {
	actorId: string | null;
	runId: string;
}

export type MarkReviewedResult =
	| RunWriteLock
	| { kind: "invalid-status"; status: TestRunStatus }
	| { kind: "not-found" }
	| { kind: "ok"; run: TestRun };

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
	| { concludedCount: number; kind: "has-results" };

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

export interface VoidTestRunInput extends RunStatusActionInput {
	reason: string | null;
}

export type VoidTestRunResult =
	| VoidTestRunRejection
	| { kind: "ok"; run: TestRun };

/** 作废测试任务。权限由调用方检查；这里在行锁内检查状态，作废后测试任务只读。 */
export function voidTestRun(
	input: VoidTestRunInput
): Promise<VoidTestRunResult> {
	return db.transaction(async (tx) => {
		const voidable = evaluateRunVoidable(await lockTestRun(tx, input.runId));
		if (voidable.kind !== "ok") {
			return voidable;
		}
		const { run } = voidable;
		const [updated] = await tx
			.update(testRuns)
			.set({
				status: "voided",
				voidedAt: new Date(),
				voidedBy: input.actorId,
				voidReason: input.reason,
			})
			.where(eq(testRuns.id, run.id))
			.returning();
		if (!updated) {
			throw new Error("voidTestRun: update returned no row");
		}
		await tx.insert(testRunEvents).values({
			actorId: input.actorId,
			fromStatus: run.status,
			reason: input.reason,
			runId: run.id,
			toStatus: "voided",
		});
		return { kind: "ok" as const, run: updated };
	});
}

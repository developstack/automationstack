import { count, desc, eq, sql } from "drizzle-orm";

import { db } from "../index";
import { type TestRunEvent, testRunEvents } from "../schema/test-run-events";
import {
	type TestRun,
	type TestRunStatus,
	testRunCases,
	testRuns,
} from "../schema/test-runs";
import { users } from "../schema/users";
import type { DbTransaction } from "./repository-types";
import {
	deriveRunStatusSteps,
	evaluateRunWritable,
	type RunConclusionCounts,
	type RunWritableResult,
} from "./test-run-status-core";

export async function lockTestRun(
	tx: DbTransaction,
	runId: string
): Promise<TestRun | undefined> {
	const [run] = await tx
		.select()
		.from(testRuns)
		.where(eq(testRuns.id, runId))
		.limit(1)
		.for("update");
	return run;
}

export async function ensureRunWritable(
	tx: DbTransaction,
	runId: string
): Promise<RunWritableResult> {
	return evaluateRunWritable(await lockTestRun(tx, runId));
}

export async function countRunConclusions(
	tx: DbTransaction,
	runId: string
): Promise<RunConclusionCounts> {
	const [row] = await tx
		.select({
			total: count(),
			untested:
				sql<number>`count(*) filter (where ${testRunCases.result} = 'untested')`.mapWith(
					Number
				),
		})
		.from(testRunCases)
		.where(eq(testRunCases.runId, runId));
	return { total: row?.total ?? 0, untested: row?.untested ?? 0 };
}

interface StatusPatch {
	completedAt: Date | null;
	startedAt?: Date;
	status: TestRunStatus;
}

function buildStatusPatch(
	run: TestRun,
	steps: TestRunStatus[],
	now: Date
): StatusPatch {
	const finalStatus = steps.at(-1) ?? run.status;
	const patch: StatusPatch = {
		completedAt: finalStatus === "completed" ? now : null,
		status: finalStatus,
	};
	if (steps.includes("in_progress") && run.startedAt === null) {
		patch.startedAt = now;
	}
	return patch;
}

export interface ApplyRunStatusOptions {
	actorId: string | null;
	run: TestRun;
}

export async function applyRunStatusDerivation(
	tx: DbTransaction,
	options: ApplyRunStatusOptions
): Promise<TestRun> {
	const { actorId, run } = options;
	const counts = await countRunConclusions(tx, run.id);
	const steps = deriveRunStatusSteps(run.status, counts);
	if (steps.length === 0) {
		return run;
	}
	const now = new Date();
	const [updated] = await tx
		.update(testRuns)
		.set(buildStatusPatch(run, steps, now))
		.where(eq(testRuns.id, run.id))
		.returning();
	if (!updated) {
		throw new Error("applyRunStatusDerivation: update returned no row");
	}
	await tx.insert(testRunEvents).values(
		steps.map((toStatus, index) => ({
			actorId,
			createdAt: new Date(now.getTime() + index),
			fromStatus: index === 0 ? run.status : (steps[index - 1] ?? null),
			runId: run.id,
			toStatus,
		}))
	);
	return updated;
}

export interface TestRunEventItem {
	actorName: string | null;
	event: TestRunEvent;
}

export async function listTestRunEvents(
	runId: string
): Promise<TestRunEventItem[]> {
	const rows = await db
		.select({
			actorName: users.username,
			event: testRunEvents,
		})
		.from(testRunEvents)
		.leftJoin(users, eq(users.id, testRunEvents.actorId))
		.where(eq(testRunEvents.runId, runId))
		.orderBy(desc(testRunEvents.createdAt));
	return rows;
}

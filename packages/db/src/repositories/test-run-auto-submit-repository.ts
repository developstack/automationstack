import { and, eq, isNull, type SQL, sql } from "drizzle-orm";

import { db } from "../index";
import {
	DEFAULT_AUTO_SUBMIT_AFTER_COMPLETED_DAYS,
	projectSettings,
} from "../schema/project-settings";
import { testRunEvents } from "../schema/test-run-events";
import { testRuns } from "../schema/test-runs";
import type { DbTransaction } from "./repository-types";

const AUTO_SUBMIT_REASON = "完成后超过设定天数未手动提交，系统自动提交";

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

export function settleAutoSubmitForProject(
	projectId: string
): Promise<string[]> {
	return db.transaction((tx) =>
		settleAutoSubmit(tx, eq(testRuns.projectId, projectId))
	);
}

export function settleAutoSubmitForRun(runId: string): Promise<string[]> {
	return db.transaction((tx) => settleAutoSubmit(tx, eq(testRuns.id, runId)));
}

export function settleAutoSubmitAll(): Promise<string[]> {
	return db.transaction((tx) => settleAutoSubmit(tx, sql`true`));
}

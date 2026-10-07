import { and, eq, inArray } from "drizzle-orm";

import { db } from "../index";
import {
	type TestRun,
	type TestRunCase,
	testRunCases,
	testRuns,
} from "../schema/test-runs";
import type { RunCaseWriteRejection } from "./test-run-case-guards";
import { ensureRunWritable } from "./test-run-status-repository";

export interface RunCaseDefectPatch {
	defectKey?: string | null;
	defectStatus?: string | null;
	defectTitle?: string | null;
	defectUrl?: string | null;
}

export type SetRunCaseDefectResult =
	| RunCaseWriteRejection
	| { kind: "ok"; run: TestRun; runCase: TestRunCase };

export function setRunCaseDefect(
	runCaseId: string,
	patch: RunCaseDefectPatch
): Promise<SetRunCaseDefectResult> {
	return db.transaction(async (tx) => {
		const [target] = await tx
			.select({ runId: testRunCases.runId })
			.from(testRunCases)
			.where(eq(testRunCases.id, runCaseId))
			.limit(1);
		if (!target) {
			return { kind: "not-found" as const };
		}
		const writable = await ensureRunWritable(tx, target.runId);
		if (writable.kind !== "ok") {
			return writable;
		}
		const [runCase] = await tx
			.update(testRunCases)
			.set(patch)
			.where(eq(testRunCases.id, runCaseId))
			.returning();
		if (!runCase) {
			throw new Error("setRunCaseDefect: update returned no row");
		}
		return { kind: "ok" as const, run: writable.run, runCase };
	});
}

export interface DefectStatusUpdate {
	id: string;
	runId: string;
}

export async function updateDefectStatusByIssueKey(
	projectId: string,
	issueKey: string,
	status: string
): Promise<DefectStatusUpdate[]> {
	const rows = await db
		.update(testRunCases)
		.set({ defectStatus: status })
		.where(
			and(
				eq(testRunCases.defectKey, issueKey),
				inArray(
					testRunCases.runId,
					db
						.select({ id: testRuns.id })
						.from(testRuns)
						.where(eq(testRuns.projectId, projectId))
				)
			)
		)
		.returning({ id: testRunCases.id, runId: testRunCases.runId });
	return rows;
}

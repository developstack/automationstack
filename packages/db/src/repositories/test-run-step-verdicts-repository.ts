import { eq } from "drizzle-orm";

import { db } from "../index";
import { type CaseStep, testCases } from "../schema/test-cases";
import {
	type TestRun,
	type TestRunCase,
	testRunCases,
} from "../schema/test-runs";
import type { DbTransaction } from "./repository-types";
import { insertRunCaseEvents } from "./test-run-case-event-writes";
import type {
	RunCaseWriteRejection,
	RunReviewPending,
} from "./test-run-case-guards";
import {
	applyRunStatusDerivation,
	ensureRunWritable,
} from "./test-run-status-repository";
import {
	buildCaseComment,
	deriveCaseResult,
	fillStepResults,
	type JudgedSteps,
	type StepComments,
	unknownStepIds,
} from "./test-run-step-results-core";

export interface SaveRunCaseStepResultsInput {
	actorId: string | null;
	caseVersion: number;
	comments: StepComments;
	judged: JudgedSteps;
	runCaseId: string;
}

export interface RunCaseChanged {
	currentVersion: number;
	kind: "case-changed";
}

export type SaveRunCaseStepResultsOutcome =
	| RunCaseChanged
	| RunCaseWriteRejection
	| RunReviewPending
	| { kind: "no-steps" }
	| { kind: "ok"; run: TestRun; runCase: TestRunCase }
	| { kind: "unknown-steps"; stepIds: string[] };

interface StepVerdictTarget {
	caseVersion: number;
	comment: string | null;
	result: TestRunCase["result"];
	runId: string;
	steps: CaseStep[];
}

async function selectStepVerdictTarget(
	tx: DbTransaction,
	runCaseId: string
): Promise<StepVerdictTarget | null> {
	const [target] = await tx
		.select({
			caseVersion: testCases.currentVersion,
			comment: testRunCases.comment,
			result: testRunCases.result,
			runId: testRunCases.runId,
			steps: testCases.steps,
		})
		.from(testRunCases)
		.innerJoin(testCases, eq(testCases.id, testRunCases.caseId))
		.where(eq(testRunCases.id, runCaseId))
		.limit(1);
	return target ?? null;
}

function rejectStaleJudgement(
	input: SaveRunCaseStepResultsInput,
	target: StepVerdictTarget
):
	| RunCaseChanged
	| { kind: "no-steps" }
	| { kind: "unknown-steps"; stepIds: string[] }
	| null {
	if (target.steps.length === 0) {
		return { kind: "no-steps" as const };
	}
	if (target.caseVersion !== input.caseVersion) {
		return {
			currentVersion: target.caseVersion,
			kind: "case-changed" as const,
		};
	}
	const stepIds = unknownStepIds(target.steps, input.judged);
	return stepIds.length > 0
		? { kind: "unknown-steps" as const, stepIds }
		: null;
}

async function writeStepVerdict(
	tx: DbTransaction,
	input: SaveRunCaseStepResultsInput,
	target: StepVerdictTarget,
	run: TestRun
): Promise<{ run: TestRun; runCase: TestRunCase }> {
	const stepResults = fillStepResults(
		target.steps,
		input.judged,
		input.comments
	);
	const result = deriveCaseResult(stepResults);
	const comment = buildCaseComment(target.steps, stepResults);
	const [runCase] = await tx
		.update(testRunCases)
		.set({
			caseVersion: target.caseVersion,
			comment,
			executedAt: new Date(),
			executedBy: input.actorId,
			executedVia: "manual",
			lastAutomationExecutionId: null,
			result,
			stepResults,
		})
		.where(eq(testRunCases.id, input.runCaseId))
		.returning();
	if (!runCase) {
		throw new Error("saveRunCaseStepResults: update returned no row");
	}
	await insertRunCaseEvents(tx, {
		actorId: input.actorId,
		comment,
		snapshots: [
			{ comment: target.comment, id: input.runCaseId, result: target.result },
		],
		toResult: result,
	});
	return {
		run: await applyRunStatusDerivation(tx, { actorId: input.actorId, run }),
		runCase,
	};
}

export function saveRunCaseStepResults(
	input: SaveRunCaseStepResultsInput
): Promise<SaveRunCaseStepResultsOutcome> {
	return db.transaction(async (tx) => {
		const target = await selectStepVerdictTarget(tx, input.runCaseId);
		if (!target) {
			return { kind: "not-found" as const };
		}
		const writable = await ensureRunWritable(tx, target.runId);
		if (writable.kind !== "ok") {
			return writable;
		}
		const { run } = writable;
		if (run.status === "pending_review") {
			return { kind: "review-pending" as const };
		}
		const stale = rejectStaleJudgement(input, target);
		if (stale !== null) {
			return stale;
		}
		const written = await writeStepVerdict(tx, input, target, run);
		return { kind: "ok" as const, run: written.run, runCase: written.runCase };
	});
}

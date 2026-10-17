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
	type StepActualResults,
	stepsMissingActualResult,
	unknownStepIds,
} from "./test-run-step-results-core";

export interface SaveRunCaseStepResultsInput {
	actorId: string | null;
	/** 每个步骤的实际结果文字，按步骤 id 索引。 */
	actualResults: StepActualResults;
	caseVersion: number;
	judged: JudgedSteps;
	runCaseId: string;
}

export interface RunCaseChanged {
	currentVersion: number;
	kind: "case-changed";
}

/** 判为失败或阻塞的步骤没有填写实际结果。stepNumbers 是这些步骤的序号（从 1 开始）。 */
export interface ActualResultRequired {
	kind: "actual-result-required";
	stepNumbers: number[];
}

type JudgementRejection =
	| ActualResultRequired
	| RunCaseChanged
	| { kind: "no-steps" }
	| { kind: "unknown-steps"; stepIds: string[] };

export type SaveRunCaseStepResultsOutcome =
	| ActualResultRequired
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

function rejectJudgement(
	input: SaveRunCaseStepResultsInput,
	target: StepVerdictTarget
): JudgementRejection | null {
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
	if (stepIds.length > 0) {
		return { kind: "unknown-steps" as const, stepIds };
	}
	const stepNumbers = stepsMissingActualResult(
		target.steps,
		input.judged,
		input.actualResults
	);
	return stepNumbers.length > 0
		? { kind: "actual-result-required" as const, stepNumbers }
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
		input.actualResults
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
		const rejection = rejectJudgement(input, target);
		if (rejection !== null) {
			return rejection;
		}
		const written = await writeStepVerdict(tx, input, target, run);
		return { kind: "ok" as const, run: written.run, runCase: written.runCase };
	});
}

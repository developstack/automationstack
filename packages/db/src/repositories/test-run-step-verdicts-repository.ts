import { and, eq, isNotNull } from "drizzle-orm";

import { db } from "../index";
import { type CaseStep, testCases } from "../schema/test-cases";
import { testRunAttachments } from "../schema/test-run-attachments";
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
	unjudgedStepsWithActualResult,
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

/** 没有判定的步骤有实际结果（文字或实际附件）。stepNumbers 是这些步骤的序号（从 1 开始）。 */
export interface VerdictRequired {
	kind: "verdict-required";
	stepNumbers: number[];
}

export type JudgementRejection =
	| ActualResultRequired
	| RunCaseChanged
	| VerdictRequired
	| { kind: "no-steps" }
	| { kind: "unknown-steps"; stepIds: string[] };

export type SaveRunCaseStepResultsOutcome =
	| StepVerdictWriteRejection
	| { kind: "ok"; run: TestRun; runCase: TestRunCase };

export interface StepVerdictTarget {
	/** 已有实际附件的步骤 id。 */
	attachedStepIds: ReadonlySet<string>;
	caseId: string;
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
			caseId: testRunCases.caseId,
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
	if (!target) {
		return null;
	}
	const attached = await tx
		.selectDistinct({ stepId: testRunAttachments.stepId })
		.from(testRunAttachments)
		.where(
			and(
				eq(testRunAttachments.runCaseId, runCaseId),
				isNotNull(testRunAttachments.stepId)
			)
		);
	return {
		...target,
		attachedStepIds: new Set(attached.flatMap((row) => row.stepId ?? [])),
	};
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
	const unjudged = unjudgedStepsWithActualResult(
		target.steps,
		input.judged,
		input.actualResults,
		target.attachedStepIds
	);
	if (unjudged.length > 0) {
		return { kind: "verdict-required" as const, stepNumbers: unjudged };
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

export async function writeStepVerdict(
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

export type StepVerdictWriteRejection =
	| JudgementRejection
	| RunCaseWriteRejection
	| RunReviewPending;

/**
 * 保存判定前的检查：执行记录存在，测试任务可以写入并且不在评审中，判定符合规则。
 * 通过时返回要写入的执行记录和测试任务。
 */
export async function prepareStepVerdictWrite(
	tx: DbTransaction,
	input: SaveRunCaseStepResultsInput
): Promise<
	| StepVerdictWriteRejection
	| { kind: "ready"; run: TestRun; target: StepVerdictTarget }
> {
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
	return { kind: "ready" as const, run, target };
}

export function saveRunCaseStepResults(
	input: SaveRunCaseStepResultsInput
): Promise<SaveRunCaseStepResultsOutcome> {
	return db.transaction(async (tx) => {
		const prepared = await prepareStepVerdictWrite(tx, input);
		if (prepared.kind !== "ready") {
			return prepared;
		}
		const written = await writeStepVerdict(
			tx,
			input,
			prepared.target,
			prepared.run
		);
		return { kind: "ok" as const, run: written.run, runCase: written.runCase };
	});
}

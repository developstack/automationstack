import { and, asc, eq } from "drizzle-orm";

import { db } from "../index";
import { caseAttachments } from "../schema/case-attachments";
import { type CaseStep, type TestCase, testCases } from "../schema/test-cases";
import { testRunAttachments } from "../schema/test-run-attachments";
import {
	type TestRun,
	type TestRunCase,
	testRunCases,
} from "../schema/test-runs";
import { writeCaseMutation } from "./case-snapshot-core";
import type { DbTransaction, RepositoryNotFound } from "./repository-types";
import { normalizeActualResult } from "./test-run-step-results-core";
import {
	prepareStepVerdictWrite,
	type SaveRunCaseStepResultsInput,
	type StepVerdictTarget,
	type StepVerdictWriteRejection,
	writeStepVerdict,
} from "./test-run-step-verdicts-repository";

/** 一个步骤的实际附件，按上传的顺序。 */
export interface StepAdoptionSource {
	attachments: {
		contentType: string;
		fileName: string;
		sizeBytes: number;
		storageKey: string;
	}[];
	caseId: string;
	projectId: string;
}

/** 设为预期结果之前，读出用例和这个步骤的实际附件，用于复制图片。执行记录不存在时返回 null。 */
export async function findStepAdoptionSource(
	runCaseId: string,
	stepId: string
): Promise<StepAdoptionSource | null> {
	const [runCase] = await db
		.select({ caseId: testRunCases.caseId, projectId: testCases.projectId })
		.from(testRunCases)
		.innerJoin(testCases, eq(testCases.id, testRunCases.caseId))
		.where(eq(testRunCases.id, runCaseId))
		.limit(1);
	if (!runCase) {
		return null;
	}
	const attachments = await db
		.select({
			contentType: testRunAttachments.contentType,
			fileName: testRunAttachments.fileName,
			sizeBytes: testRunAttachments.sizeBytes,
			storageKey: testRunAttachments.storageKey,
		})
		.from(testRunAttachments)
		.where(
			and(
				eq(testRunAttachments.runCaseId, runCaseId),
				eq(testRunAttachments.stepId, stepId)
			)
		)
		.orderBy(asc(testRunAttachments.createdAt), asc(testRunAttachments.id));
	return { ...runCase, attachments };
}

/** 已经复制到用例目录中的一张图片，还没有登记为用例附件。 */
export interface CopiedCaseImage {
	contentType: string;
	fileName: string;
	sizeBytes: number;
	storageKey: string;
}

export interface AdoptActualAsExpectedInput
	extends SaveRunCaseStepResultsInput {
	actorName: string | null;
	/** 复制为预期截图的图片，按顺序。空列表表示保留现有的预期截图。 */
	images: CopiedCaseImage[];
	/** 实际结果被设为预期结果的步骤。这个步骤判定为通过。 */
	stepId: string;
}

export type AdoptActualAsExpectedOutcome =
	| StepVerdictWriteRejection
	| { kind: "no-actual-result" }
	| {
			kind: "ok";
			run: TestRun;
			runCase: TestRunCase;
			stepNumber: number;
			testCase: TestCase;
	  };

async function insertCaseImages(
	tx: DbTransaction,
	caseId: string,
	createdBy: string | null,
	images: readonly CopiedCaseImage[]
): Promise<string[]> {
	if (images.length === 0) {
		return [];
	}
	const rows = await tx
		.insert(caseAttachments)
		.values(images.map((image) => ({ ...image, caseId, createdBy })))
		.returning({
			id: caseAttachments.id,
			storageKey: caseAttachments.storageKey,
		});
	const idByKey = new Map(rows.map((row) => [row.storageKey, row.id]));
	return images.flatMap((image) => idByKey.get(image.storageKey) ?? []);
}

/** 实际结果的文字和图片替换预期结果。没有文字时保留预期文字，没有图片时保留预期截图。 */
function adoptedStep(
	step: CaseStep,
	text: string | null,
	screenshotIds: string[]
): CaseStep {
	return {
		...step,
		expected: text ?? step.expected,
		...(screenshotIds.length > 0 ? { expectedScreenshots: screenshotIds } : {}),
	};
}

interface AdoptedCaseWrite {
	index: number;
	input: AdoptActualAsExpectedInput;
	run: TestRun;
	target: StepVerdictTarget;
	text: string | null;
}

/** 登记复制的图片，并把用例中这个步骤的预期结果改为实际结果。用例被别人改过时返回 case-changed。 */
async function writeAdoptedCase(
	tx: DbTransaction,
	{ index, input, run, target, text }: AdoptedCaseWrite
): Promise<
	| RepositoryNotFound
	| { currentVersion: number; kind: "case-changed" }
	| { kind: "written"; testCase: TestCase }
> {
	const screenshotIds = await insertCaseImages(
		tx,
		target.caseId,
		input.actorId,
		input.images
	);
	const written = await writeCaseMutation(tx, {
		actorName: input.actorName,
		caseId: target.caseId,
		changeNote: `用实际结果作为预期结果：测试任务「${run.name}」第 ${index + 1} 步`,
		expectedVersion: input.caseVersion,
		patch: {
			steps: target.steps.map((step, position) =>
				position === index ? adoptedStep(step, text, screenshotIds) : step
			),
		},
	});
	if (written.kind === "conflict") {
		return { currentVersion: written.currentVersion, kind: "case-changed" };
	}
	if (written.kind === "not-found") {
		return written;
	}
	return { kind: "written", testCase: written.testCase };
}

/**
 * 设为预期结果：在一个事务中，把一个步骤的实际结果写成用例中这个步骤的预期结果（生成新的用例版本），
 * 这个步骤判定为通过，并保存其他步骤的判定和实际结果。规则与保存判定相同。
 * 用例在打开执行页后被改过时返回 case-changed，什么都不写入。
 */
export function adoptActualAsExpected(
	input: AdoptActualAsExpectedInput
): Promise<AdoptActualAsExpectedOutcome> {
	return db.transaction(async (tx) => {
		const verdicts = {
			...input,
			judged: { ...input.judged, [input.stepId]: "passed" as const },
		};
		const prepared = await prepareStepVerdictWrite(tx, verdicts);
		if (prepared.kind !== "ready") {
			return prepared;
		}
		const { run, target } = prepared;
		const index = target.steps.findIndex((step) => step.id === input.stepId);
		if (index === -1) {
			return { kind: "unknown-steps" as const, stepIds: [input.stepId] };
		}
		const text = normalizeActualResult(input.actualResults[input.stepId]);
		if (text === null && input.images.length === 0) {
			return { kind: "no-actual-result" as const };
		}
		const written = await writeAdoptedCase(tx, {
			index,
			input,
			run,
			target,
			text,
		});
		if (written.kind !== "written") {
			return written;
		}
		const { testCase } = written;
		const saved = await writeStepVerdict(
			tx,
			verdicts,
			{
				...target,
				caseVersion: testCase.currentVersion,
				steps: testCase.steps,
			},
			run
		);
		return { kind: "ok" as const, ...saved, stepNumber: index + 1, testCase };
	});
}

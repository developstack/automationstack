import { eq } from "drizzle-orm";

import { db } from "../index";
import { modules } from "../schema/modules";
import type {
	CasePriority,
	CaseStatus,
	CaseStep,
	CaseType,
	CaseVersion,
	TestCase,
} from "../schema/test-cases";
import { testCases } from "../schema/test-cases";
import {
	type CaseContentPatch,
	insertCaseVersion,
	type WriteCaseMutationOptions,
	writeCaseMutation,
} from "./case-snapshot-core";
import type { CaseWriteResult, DbTransaction } from "./repository-types";
import { countCasesInModule, openCaseSlot } from "./test-cases-repository";

const CREATE_CHANGE_NOTE = "创建用例";

export interface CreateTestCaseInput {
	actorName: string | null;
	caseType?: CaseType;
	index?: number;
	maintainer?: string | null;
	moduleId: string;
	name: string;
	preconditions?: string | null;
	priority?: CasePriority;
	projectId: string;
	sourceRef?: string | null;
	status?: CaseStatus;
	steps?: CaseStep[];
	tags?: string[];
}

export interface CreatedTestCase {
	testCase: TestCase;
	version: CaseVersion;
}

/** The target module does not exist or belongs to another project. */
export type CreateTestCaseResult =
	| { kind: "created"; testCase: TestCase; version: CaseVersion }
	| { kind: "invalid-module" };

/** True only when the module exists and belongs to the given project. */
async function moduleBelongsToProject(
	tx: DbTransaction,
	moduleId: string,
	projectId: string
): Promise<boolean> {
	const [targetModule] = await tx
		.select({ projectId: modules.projectId })
		.from(modules)
		.where(eq(modules.id, moduleId))
		.limit(1);
	return targetModule?.projectId === projectId;
}

function toCaseInsertValues(
	input: CreateTestCaseInput,
	sortOrder: number
): typeof testCases.$inferInsert {
	return {
		caseType: input.caseType,
		lastModifiedBy: input.actorName,
		maintainer: input.maintainer ?? null,
		moduleId: input.moduleId,
		name: input.name,
		preconditions: input.preconditions ?? null,
		priority: input.priority,
		projectId: input.projectId,
		sortOrder,
		sourceRef: input.sourceRef ?? null,
		status: input.status,
		steps: input.steps ?? [],
		tags: input.tags ?? [],
	};
}

/**
 * Inserts a test case and its v1 snapshot in the given transaction.
 * The target module must belong to `input.projectId` (typed failure
 * otherwise). The new case is appended to (or spliced into) its
 * module's sort group.
 */
export async function createTestCaseInTx(
	tx: DbTransaction,
	input: CreateTestCaseInput
): Promise<CreateTestCaseResult> {
	const owned = await moduleBelongsToProject(
		tx,
		input.moduleId,
		input.projectId
	);
	if (!owned) {
		return { kind: "invalid-module" };
	}
	const total = await countCasesInModule(tx, input.moduleId);
	const index = Math.min(Math.max(input.index ?? total, 0), total);
	if (index < total) {
		await openCaseSlot(tx, input.moduleId, index);
	}
	const [row] = await tx
		.insert(testCases)
		.values(toCaseInsertValues(input, index))
		.returning();
	if (!row) {
		throw new Error("createTestCase: insert returned no row");
	}
	const version = await insertCaseVersion(tx, {
		changeNote: CREATE_CHANGE_NOTE,
		row,
		savedBy: input.actorName,
	});
	return { kind: "created", testCase: row, version };
}

export function createTestCase(
	input: CreateTestCaseInput
): Promise<CreateTestCaseResult> {
	return db.transaction((tx) => createTestCaseInTx(tx, input));
}

export interface UpdateTestCaseInput {
	actorName: string | null;
	changeNote?: string | null;
	/** User edit path passes the version it loaded; omit for system writes. */
	expectedVersion?: number;
	id: string;
	patch: CaseContentPatch;
}

/**
 * Content update through the snapshot pipeline. Returns a typed conflict
 * result when `expectedVersion` no longer matches (optimistic lock).
 */
export function updateTestCase(
	input: UpdateTestCaseInput
): Promise<CaseWriteResult> {
	const options: WriteCaseMutationOptions = {
		actorName: input.actorName,
		caseId: input.id,
		changeNote: input.changeNote,
		expectedVersion: input.expectedVersion,
		patch: input.patch,
	};
	return db.transaction((tx) => writeCaseMutation(tx, options));
}

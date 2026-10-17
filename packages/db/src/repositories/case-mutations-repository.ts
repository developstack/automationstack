import { asc, eq, inArray } from "drizzle-orm";

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
	insertCaseAttachmentsInTx,
	type NewCaseAttachmentRow,
} from "./case-attachments-repository";
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
	attachments?: NewCaseAttachmentRow[];
	caseType?: CaseType;
	id?: string;
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

export type CreateTestCaseResult =
	| { kind: "created"; testCase: TestCase; version: CaseVersion }
	| { kind: "duplicate-id" }
	| { kind: "invalid-module" };

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
		id: input.id,
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
	await insertCaseAttachmentsInTx(tx, row.id, input.attachments ?? []);
	return { kind: "created", testCase: row, version };
}

const UNIQUE_VIOLATION_CODE = "23505";

const CASE_PKEY_CONSTRAINT = "test_cases_pkey";

function isDuplicateCaseId(error: unknown): boolean {
	if (typeof error !== "object" || error === null) {
		return false;
	}
	return (
		"code" in error &&
		error.code === UNIQUE_VIOLATION_CODE &&
		"constraint" in error &&
		error.constraint === CASE_PKEY_CONSTRAINT
	);
}

export async function createTestCase(
	input: CreateTestCaseInput
): Promise<CreateTestCaseResult> {
	try {
		return await db.transaction((tx) => createTestCaseInTx(tx, input));
	} catch (error) {
		if (input.id !== undefined && isDuplicateCaseId(error)) {
			return { kind: "duplicate-id" };
		}
		throw error;
	}
}

export interface UpdateTestCaseInput {
	actorName: string | null;
	changeNote?: string | null;
	expectedVersion?: number;
	id: string;
	patch: CaseContentPatch;
}

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

export interface ChangeCaseStatusInput {
	actorName: string | null;
	caseIds: readonly string[];
	status: CaseStatus;
}

export interface CaseStatusChange {
	previousStatus: CaseStatus;
	testCase: TestCase;
	/** 状态没有变化时为 null：不记录新版本。 */
	version: CaseVersion | null;
}

export type ChangeCaseStatusResult =
	| { changes: CaseStatusChange[]; kind: "ok" }
	| { kind: "not-found"; missingIds: string[] };

export async function changeCaseStatusInTx(
	tx: DbTransaction,
	input: ChangeCaseStatusInput
): Promise<ChangeCaseStatusResult> {
	// 按 id 的顺序加锁。两个同时进行的批量修改按同一个顺序等待，不会死锁
	const caseIds = [...new Set(input.caseIds)].sort();
	const locked = await tx
		.select({ id: testCases.id, status: testCases.status })
		.from(testCases)
		.where(inArray(testCases.id, caseIds))
		.orderBy(asc(testCases.id))
		.for("update");
	const previousById = new Map(locked.map((row) => [row.id, row.status]));
	const missingIds = caseIds.filter((id) => !previousById.has(id));
	if (missingIds.length > 0) {
		return { kind: "not-found", missingIds };
	}
	const changes: CaseStatusChange[] = [];
	for (const caseId of caseIds) {
		// 只改状态时不检查版本（不传 expectedVersion），状态变化时与普通保存一样记录新版本
		// biome-ignore lint/performance/noAwaitInLoops: 同一个事务中的写入只能串行
		const result = await writeCaseMutation(tx, {
			actorName: input.actorName,
			caseId,
			patch: { status: input.status },
		});
		const previousStatus = previousById.get(caseId);
		// 行已加锁，又不检查版本，所以不会是 not-found 或 conflict
		if (
			previousStatus === undefined ||
			result.kind === "not-found" ||
			result.kind === "conflict"
		) {
			throw new Error(`changeCaseStatus: 加锁的用例 ${caseId} 写入失败`);
		}
		changes.push({
			previousStatus,
			testCase: result.testCase,
			version: result.kind === "written" ? result.version : null,
		});
	}
	return { changes, kind: "ok" };
}

/**
 * 只改一组用例的状态，在一个事务中完成。
 * 有一条用例不存在时什么都不改。单条修改传一个 id，批量修改传多个 id。
 */
export function changeCaseStatus(
	input: ChangeCaseStatusInput
): Promise<ChangeCaseStatusResult> {
	return db.transaction((tx) => changeCaseStatusInTx(tx, input));
}

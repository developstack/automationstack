import { and, asc } from "drizzle-orm";

import { db } from "../index";
import type { CaseStatus } from "../schema/test-cases";
import { testCases } from "../schema/test-cases";
import {
	buildCaseListConditions,
	type CaseListFilter,
} from "./case-list-repository";
import {
	type MoveTestCasesResult,
	moveTestCasesInTx,
} from "./case-move-repository";
import {
	type CaseStatusChange,
	changeCaseStatusInTx,
} from "./case-mutations-repository";
import type { DbTransaction } from "./repository-types";
import {
	type RemoveTestCasesResult,
	removeTestCasesInTx,
} from "./test-cases-repository";

/** 按筛选条件的批量操作：符合筛选的用例超过 limit 条时什么都不改。 */
interface CaseFilterBatchInput {
	filter: CaseListFilter;
	limit: number;
}

interface TooMany {
	kind: "too-many";
}

/**
 * 在事务中找出现在符合筛选的用例并按 id 的顺序加锁，最多 limit 条；超过时返回 null。
 * 加锁的顺序与按 id 的批量操作相同，所以两种批量操作同时进行时不会死锁。
 * 加锁后这些用例不会被别人删除或修改，后面的写入作用于加锁时符合筛选的用例。
 */
async function lockCaseIdsByFilter(
	tx: DbTransaction,
	{ filter, limit }: CaseFilterBatchInput
): Promise<string[] | null> {
	const conditions = await buildCaseListConditions(tx, filter);
	const rows = await tx
		.select({ id: testCases.id })
		.from(testCases)
		.where(and(...conditions))
		.orderBy(asc(testCases.id))
		.limit(limit + 1)
		.for("update");
	return rows.length > limit ? null : rows.map((row) => row.id);
}

/** 现在符合筛选的用例 id，不加锁，最多 limit 条；超过时返回 null。用于移动前的预览。 */
export async function listCaseIdsByFilter({
	filter,
	limit,
}: CaseFilterBatchInput): Promise<string[] | null> {
	const conditions = await buildCaseListConditions(db, filter);
	const rows = await db
		.select({ id: testCases.id })
		.from(testCases)
		.where(and(...conditions))
		.orderBy(asc(testCases.id))
		.limit(limit + 1);
	return rows.length > limit ? null : rows.map((row) => row.id);
}

export interface ChangeCaseStatusByFilterInput extends CaseFilterBatchInput {
	actorName: string | null;
	status: CaseStatus;
}

export type ChangeCaseStatusByFilterResult =
	| TooMany
	| { changes: CaseStatusChange[]; kind: "ok" };

/**
 * 只改所有符合筛选的用例的状态，在一个事务中完成，规则与按 id 修改相同。
 * 作用于提交请求时符合筛选的用例，返回实际修改的用例。
 */
export function changeCaseStatusByFilter(
	input: ChangeCaseStatusByFilterInput
): Promise<ChangeCaseStatusByFilterResult> {
	return db.transaction(async (tx) => {
		const caseIds = await lockCaseIdsByFilter(tx, input);
		if (caseIds === null) {
			return { kind: "too-many" };
		}
		const result = await changeCaseStatusInTx(tx, {
			actorName: input.actorName,
			caseIds,
			status: input.status,
		});
		// 用例已加锁，不会不存在
		if (result.kind === "not-found") {
			throw new Error("changeCaseStatusByFilter: 加锁的用例不存在");
		}
		return result;
	});
}

export type RemoveTestCasesByFilterResult =
	| TooMany
	| ({ kind: "ok" } & RemoveTestCasesResult);

/**
 * 删除所有符合筛选的用例，在一个事务中完成，规则与按 id 删除相同：被测试任务用到的用例跳过。
 * 作用于提交请求时符合筛选的用例，返回实际删除和跳过的用例。
 */
export function removeTestCasesByFilter(
	input: CaseFilterBatchInput
): Promise<RemoveTestCasesByFilterResult> {
	return db.transaction(async (tx) => {
		const caseIds = await lockCaseIdsByFilter(tx, input);
		if (caseIds === null) {
			return { kind: "too-many" };
		}
		const result = await removeTestCasesInTx(tx, {
			caseIds,
			projectId: input.filter.projectId,
		});
		return { kind: "ok", ...result };
	});
}

export interface MoveTestCasesByFilterInput extends CaseFilterBatchInput {
	moduleId: string;
}

export type MoveTestCasesByFilterResult = TooMany | MoveTestCasesResult;

/**
 * 把所有符合筛选的用例移到一个模块的最后，在一个事务中完成，规则与按 id 移动相同。
 * 作用于提交请求时符合筛选的用例，返回实际移动的用例。
 */
export function moveTestCasesByFilter(
	input: MoveTestCasesByFilterInput
): Promise<MoveTestCasesByFilterResult> {
	return db.transaction(async (tx) => {
		const caseIds = await lockCaseIdsByFilter(tx, input);
		if (caseIds === null) {
			return { kind: "too-many" };
		}
		return moveTestCasesInTx(tx, { caseIds, moduleId: input.moduleId });
	});
}

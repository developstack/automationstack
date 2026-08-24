import { and, eq, inArray, max } from "drizzle-orm";

import { db } from "../index";
import { testCases } from "../schema/test-cases";
import { type TestRun, testRunCases } from "../schema/test-runs";
import { users } from "../schema/users";
import type { DbTransaction } from "./repository-types";
import {
	dedupe,
	findInvalidRunCaseIds,
	type InvalidRunCases,
	type RunCaseWriteRejection,
} from "./test-run-case-guards";
import {
	applyRunStatusDerivation,
	ensureRunWritable,
} from "./test-run-status-repository";

/**
 * 测试任务的**范围与指派**：加用例、移除用例、指派执行人。
 *
 * 与 `test-run-verdicts-repository.ts` 分开，是因为两者动的字段和触发场景不同：
 * 这里改的是「这个任务要测哪些用例、谁去测」，那里改的是「测出来什么结论」。
 * 共同点只有开头的 `ensureRunWritable` 和结尾的状态推导，而那两段本就在
 * `test-run-status-repository.ts` 里共用。
 */

export interface AddCasesToRunInput {
	actorId: string | null;
	caseIds: string[];
	runId: string;
}

export type AddCasesToRunResult =
	| RunCaseWriteRejection
	| { invalidCaseIds: string[]; kind: "invalid-cases" }
	| {
			addedRunCaseIds: string[];
			kind: "ok";
			run: TestRun;
			/** 本来就在测试任务里、被唯一约束挡下的用例；重复勾选不算错误。 */
			skippedCaseIds: string[];
	  };

async function findInvalidCaseIds(
	tx: DbTransaction,
	projectId: string,
	caseIds: string[]
): Promise<string[]> {
	if (caseIds.length === 0) {
		return [];
	}
	const rows = await tx
		.select({ id: testCases.id })
		.from(testCases)
		.where(
			and(eq(testCases.projectId, projectId), inArray(testCases.id, caseIds))
		);
	const owned = new Set(rows.map((row) => row.id));
	return caseIds.filter((id) => !owned.has(id));
}

async function nextSortOrder(
	tx: DbTransaction,
	runId: string
): Promise<number> {
	const [row] = await tx
		.select({ value: max(testRunCases.sortOrder) })
		.from(testRunCases)
		.where(eq(testRunCases.runId, runId));
	return (row?.value ?? -1) + 1;
}

/**
 * 追加用例：**任意状态随时可加，无限制、无额外提示**（D13）。
 *
 * 加到已完成的测试任务上会让它出现 `untested` 行，末尾的状态推导据此把它自动拉回
 * 「测试中」——这正是把状态做成结论的函数所买到的东西：这里不需要写任何
 * 「如果测试任务已完成就……」的分支。
 *
 * 重复勾选走 `onConflictDoNothing` 打在唯一约束上，而不是先查再插：
 * 后者在两个人同时追加同一条用例时会插出两行。
 */
export function addCasesToRun(
	input: AddCasesToRunInput
): Promise<AddCasesToRunResult> {
	return db.transaction(async (tx) => {
		const writable = await ensureRunWritable(tx, input.runId);
		if (writable.kind !== "ok") {
			return writable;
		}
		const { run } = writable;
		const caseIds = dedupe(input.caseIds);
		const invalidCaseIds = await findInvalidCaseIds(tx, run.projectId, caseIds);
		if (invalidCaseIds.length > 0) {
			return { invalidCaseIds, kind: "invalid-cases" as const };
		}
		if (caseIds.length === 0) {
			return {
				addedRunCaseIds: [],
				kind: "ok" as const,
				run,
				skippedCaseIds: [],
			};
		}
		const base = await nextSortOrder(tx, run.id);
		const inserted = await tx
			.insert(testRunCases)
			.values(
				caseIds.map((caseId, offset) => ({
					caseId,
					runId: run.id,
					sortOrder: base + offset,
				}))
			)
			.onConflictDoNothing()
			.returning({ caseId: testRunCases.caseId, id: testRunCases.id });
		const insertedCaseIds = new Set(inserted.map((row) => row.caseId));
		const updated = await applyRunStatusDerivation(tx, {
			actorId: input.actorId,
			run,
		});
		return {
			addedRunCaseIds: inserted.map((row) => row.id),
			kind: "ok" as const,
			run: updated,
			skippedCaseIds: caseIds.filter((id) => !insertedCaseIds.has(id)),
		};
	});
}

export interface RemoveRunCasesInput {
	actorId: string | null;
	runCaseIds: string[];
	runId: string;
}

export type RemoveRunCasesResult =
	| RunCaseWriteRejection
	| { kind: "ok"; removedRunCaseIds: string[]; run: TestRun };

/**
 * 移除测试任务里的用例行。删掉的若是仅存的几条 `untested`，末尾的推导会把它推进到
 * 「已完成」——同一段推导覆盖了增、删、改三类触发源，不需要各写一套。
 */
export function removeRunCases(
	input: RemoveRunCasesInput
): Promise<RemoveRunCasesResult> {
	return db.transaction(async (tx) => {
		const writable = await ensureRunWritable(tx, input.runId);
		if (writable.kind !== "ok") {
			return writable;
		}
		const { run } = writable;
		const runCaseIds = dedupe(input.runCaseIds);
		if (runCaseIds.length === 0) {
			return { kind: "ok" as const, removedRunCaseIds: [], run };
		}
		const removed = await tx
			.delete(testRunCases)
			.where(
				and(
					eq(testRunCases.runId, run.id),
					inArray(testRunCases.id, runCaseIds)
				)
			)
			.returning({ id: testRunCases.id });
		const updated = await applyRunStatusDerivation(tx, {
			actorId: input.actorId,
			run,
		});
		return {
			kind: "ok" as const,
			removedRunCaseIds: removed.map((row) => row.id),
			run: updated,
		};
	});
}

export interface AssignRunCasesInput {
	/** null 表示取消指派。 */
	assigneeId: string | null;
	runCaseIds: string[];
	/**
	 * 必传，不是冗余参数（别删）：批量操作若允许跨测试任务，就得对多个任务按固定顺序
	 * 逐个加行锁才不会与另一个反序加锁的事务死锁——而前端的批量入口永远在
	 * 某个测试任务的详情页里，`runId` 天然在手上，为一个产生不出来的用法付有序加锁
	 * 的复杂度不划算。传进来的 run_case 必须全部属于这个测试任务，否则整批拒绝。
	 */
	runId: string;
}

export type AssignRunCasesResult =
	| InvalidRunCases
	| RunCaseWriteRejection
	| { kind: "invalid-assignee" }
	| { kind: "ok"; run: TestRun; runCaseIds: string[] };

/**
 * 指派执行人。不改结论，因此不触发状态推导；但仍要过 `ensureRunWritable`——
 * 已提交的测试任务连「谁该测这条」都是报告的一部分，不能事后改。
 */
export function assignRunCases(
	input: AssignRunCasesInput
): Promise<AssignRunCasesResult> {
	return db.transaction(async (tx) => {
		const writable = await ensureRunWritable(tx, input.runId);
		if (writable.kind !== "ok") {
			return writable;
		}
		const runCaseIds = dedupe(input.runCaseIds);
		const invalidRunCaseIds = await findInvalidRunCaseIds(
			tx,
			writable.run.id,
			runCaseIds
		);
		if (invalidRunCaseIds.length > 0) {
			return { invalidRunCaseIds, kind: "invalid-run-cases" as const };
		}
		if (input.assigneeId !== null) {
			const [assignee] = await tx
				.select({ id: users.id })
				.from(users)
				.where(eq(users.id, input.assigneeId))
				.limit(1);
			if (!assignee) {
				return { kind: "invalid-assignee" as const };
			}
		}
		if (runCaseIds.length === 0) {
			return { kind: "ok" as const, run: writable.run, runCaseIds: [] };
		}
		const updated = await tx
			.update(testRunCases)
			.set({ assigneeId: input.assigneeId })
			.where(inArray(testRunCases.id, runCaseIds))
			.returning({ id: testRunCases.id });
		return {
			kind: "ok" as const,
			run: writable.run,
			runCaseIds: updated.map((row) => row.id),
		};
	});
}

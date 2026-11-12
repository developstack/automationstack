import { asc, eq, inArray } from "drizzle-orm";

import { db } from "../index";
import { modules } from "../schema/modules";
import { type TestCase, testCases } from "../schema/test-cases";
import { planCaseMove } from "./case-move-core";
import type { DbTransaction } from "./repository-types";
import { moveTestCaseInTx } from "./test-cases-repository";

export interface MoveTestCasesInput {
	caseIds: readonly string[];
	/** 目标模块。必须与所有用例在同一个项目中。 */
	moduleId: string;
}

export type MoveTestCasesResult =
	| { kind: "invalid-module" }
	| {
			kind: "ok";
			/** 请求中有、数据库中已经没有的用例。 */
			missingIds: string[];
			/** 移动后的用例。 */
			moved: TestCase[];
			/** 用例的模块跟着改的测试任务（ADR 0009）。 */
			syncedRunIds: string[];
			/** 已经在目标模块中、没有移动的用例。 */
			unchanged: TestCase[];
	  };

/**
 * 把一组用例移到一个模块的最后，在调用者的事务中完成。
 * 用例按 id 的顺序加锁，与其他批量操作的加锁顺序相同，所以同时进行时不会死锁。
 * 目标模块不存在，或与某条用例不在同一个项目中时，什么都不改，返回 invalid-module。
 * 与移动一条用例相同，不记录新版本；进行中的测试任务中这些用例的模块跟着改。
 */
export async function moveTestCasesInTx(
	tx: DbTransaction,
	input: MoveTestCasesInput
): Promise<MoveTestCasesResult> {
	const [target] = await tx
		.select({ projectId: modules.projectId })
		.from(modules)
		.where(eq(modules.id, input.moduleId))
		.limit(1);
	if (target === undefined) {
		return { kind: "invalid-module" };
	}
	const locked = await tx
		.select()
		.from(testCases)
		.where(inArray(testCases.id, [...new Set(input.caseIds)]))
		.orderBy(asc(testCases.id))
		.for("update");
	if (locked.some((testCase) => testCase.projectId !== target.projectId)) {
		return { kind: "invalid-module" };
	}
	const plan = planCaseMove(input.caseIds, locked, input.moduleId);
	const moved: TestCase[] = [];
	const syncedRunIds = new Set<string>();
	for (const testCase of plan.movable) {
		// biome-ignore lint/performance/noAwaitInLoops: 同一个事务中的写入只能串行
		const result = await moveTestCaseInTx(tx, {
			id: testCase.id,
			moduleId: input.moduleId,
		});
		// 用例已加锁，目标模块已检查，所以只会成功
		if (result.kind !== "ok") {
			throw new Error(`moveTestCases: 加锁的用例不能移动（${result.kind}）`);
		}
		moved.push(result.testCase);
		for (const runId of result.syncedRunIds) {
			syncedRunIds.add(runId);
		}
	}
	return {
		kind: "ok",
		missingIds: plan.missingIds,
		moved,
		syncedRunIds: [...syncedRunIds],
		unchanged: plan.unchanged,
	};
}

/** 把一组用例移到一个模块的最后，在一个事务中完成（见 moveTestCasesInTx）。 */
export function moveTestCases(
	input: MoveTestCasesInput
): Promise<MoveTestCasesResult> {
	return db.transaction((tx) => moveTestCasesInTx(tx, input));
}

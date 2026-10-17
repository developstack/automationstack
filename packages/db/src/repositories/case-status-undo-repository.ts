import { and, asc, eq, inArray } from "drizzle-orm";

import { db } from "../index";
import { testCases } from "../schema/test-cases";
import type { CaseStatusChange } from "./case-mutations-repository";
import { writeCaseMutation } from "./case-snapshot-core";
import {
	type CaseStatusUndoTarget,
	planCaseStatusUndo,
	previousStatusById,
} from "./case-status-undo-core";

export interface UndoCaseStatusChangeInput extends CaseStatusUndoTarget {
	actorName: string | null;
	projectId: string;
}

export interface UndoCaseStatusChangeResult {
	/** 恢复的用例。previousStatus 是撤销前的状态（这次修改改为的状态）。 */
	changes: CaseStatusChange[];
	/** 跳过的用例：修改后又被改过，或已经不在这个项目中。 */
	skippedIds: string[];
}

/**
 * 撤销一次状态修改，在一个事务中完成：把还是这次修改改为的状态的用例恢复为各自原来的状态，
 * 规则与修改状态相同（不检查版本，每条恢复的用例记录一个新版本）。其他用例跳过（见 planCaseStatusUndo）。
 */
export function undoCaseStatusChange(
	input: UndoCaseStatusChangeInput
): Promise<UndoCaseStatusChangeResult> {
	return db.transaction(async (tx) => {
		const caseIds = previousStatusById(input).map(([caseId]) => caseId);
		// 按 id 的顺序加锁，与按 id 和按筛选条件修改状态相同，同时进行时不会死锁
		const locked =
			caseIds.length === 0
				? []
				: await tx
						.select({ id: testCases.id, status: testCases.status })
						.from(testCases)
						.where(
							and(
								inArray(testCases.id, caseIds),
								eq(testCases.projectId, input.projectId)
							)
						)
						.orderBy(asc(testCases.id))
						.for("update");
		const plan = planCaseStatusUndo(locked, input);
		const changes: CaseStatusChange[] = [];
		for (const { caseId, status } of plan.restores) {
			// biome-ignore lint/performance/noAwaitInLoops: 同一个事务中的写入只能串行
			const result = await writeCaseMutation(tx, {
				actorName: input.actorName,
				caseId,
				patch: { status },
			});
			// 行已加锁，状态与恢复为的状态不同，又不检查版本，所以一定写入
			if (result.kind !== "written") {
				throw new Error(`undoCaseStatusChange: 加锁的用例 ${caseId} 写入失败`);
			}
			changes.push({
				previousStatus: input.status,
				testCase: result.testCase,
				version: result.version,
			});
		}
		return { changes, skippedIds: plan.skippedIds };
	});
}

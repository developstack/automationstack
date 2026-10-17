import { type CaseStatus, caseStatusEnum } from "../schema/test-cases";

/** 要撤销的一次状态修改：改为哪个状态，每条改过的用例原来的状态。 */
export interface CaseStatusUndoTarget {
	idsByPreviousStatus: Partial<Record<CaseStatus, readonly string[]>>;
	status: CaseStatus;
}

/** 撤销的结果：恢复的用例和恢复为的状态，以及跳过的用例。都按 id 排序（加锁的顺序）。 */
export interface CaseStatusUndoPlan {
	restores: { caseId: string; status: CaseStatus }[];
	skippedIds: string[];
}

/** 这次修改改过的用例 id 和它原来的状态，按 id 排序。 */
export function previousStatusById(
	target: CaseStatusUndoTarget
): [string, CaseStatus][] {
	const entries: [string, CaseStatus][] = [];
	for (const status of caseStatusEnum.enumValues) {
		for (const id of target.idsByPreviousStatus[status] ?? []) {
			entries.push([id, status]);
		}
	}
	// 与按 id 修改状态（changeCaseStatusInTx）的排序相同
	return entries.sort(([left], [right]) => (left < right ? -1 : 1));
}

/**
 * 撤销一次状态修改时恢复哪些用例。只恢复现在还是这次修改改为的状态的用例：
 * 修改后又被别人（或自己）改过的用例保留现在的状态，不在 current 中的用例
 * （已被删除，或不在这个项目中）也跳过。
 */
export function planCaseStatusUndo(
	current: readonly { id: string; status: CaseStatus }[],
	target: CaseStatusUndoTarget
): CaseStatusUndoPlan {
	const currentById = new Map(current.map((row) => [row.id, row.status]));
	const plan: CaseStatusUndoPlan = { restores: [], skippedIds: [] };
	for (const [caseId, status] of previousStatusById(target)) {
		if (currentById.get(caseId) === target.status) {
			plan.restores.push({ caseId, status });
		} else {
			plan.skippedIds.push(caseId);
		}
	}
	return plan;
}

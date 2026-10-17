/** 批量删除时加锁读出的用例：判断删除或跳过，并在删除后补上模块中的排序空位。 */
export interface CaseRemovalRow {
	id: string;
	moduleId: string;
	name: string;
	sortOrder: number;
}

export interface SkippedCaseRemoval<T extends CaseRemovalRow> {
	/** 用到这条用例的测试任务数，包括已作废的测试任务。 */
	referencedByRunCount: number;
	testCase: T;
}

export interface CaseRemovalPlan<T extends CaseRemovalRow> {
	/** 请求中有、数据库中已经没有的用例（例如已被别人删除），当作已经删除。 */
	missingIds: string[];
	/** 要删除的用例，按排序从后往前。 */
	removable: T[];
	/** 被测试任务用到的用例：测试任务不能删除，所以这些用例只能改为废弃（ADR 0004）。 */
	skipped: SkippedCaseRemoval<T>[];
}

/**
 * 把一组要删除的用例分为删除、跳过和不存在三类。
 * 删除的用例按排序从后往前：每删一条，同一模块中排在它后面的用例前移一位，
 * 先删后面的用例，还没有删的用例的排序就不会变。
 */
export function planCaseRemoval<T extends CaseRemovalRow>(
	caseIds: readonly string[],
	locked: readonly T[],
	runCountByCaseId: ReadonlyMap<string, number>
): CaseRemovalPlan<T> {
	const lockedIds = new Set(locked.map((testCase) => testCase.id));
	const missingIds = [...new Set(caseIds)].filter((id) => !lockedIds.has(id));
	const removable: T[] = [];
	const skipped: SkippedCaseRemoval<T>[] = [];
	for (const testCase of locked) {
		const referencedByRunCount = runCountByCaseId.get(testCase.id) ?? 0;
		if (referencedByRunCount > 0) {
			skipped.push({ referencedByRunCount, testCase });
		} else {
			removable.push(testCase);
		}
	}
	removable.sort((left, right) => right.sortOrder - left.sortOrder);
	return { missingIds, removable, skipped };
}

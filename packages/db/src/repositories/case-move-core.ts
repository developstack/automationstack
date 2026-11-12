/** 批量移动时加锁读出的用例。 */
export interface CaseMoveRow {
	id: string;
	moduleId: string;
	sortOrder: number;
}

export interface CaseMovePlan<T extends CaseMoveRow> {
	/** 请求中有、数据库中已经没有的用例（例如已被别人删除）。 */
	missingIds: string[];
	/** 要移动的用例：同一个原模块中的用例保持原来的先后顺序，依次排到目标模块的最后。 */
	movable: T[];
	/** 已经在目标模块中的用例，不移动。 */
	unchanged: T[];
}

/** 把一组要移动到 targetModuleId 的用例分为移动、不变和不存在三类。 */
export function planCaseMove<T extends CaseMoveRow>(
	caseIds: readonly string[],
	locked: readonly T[],
	targetModuleId: string
): CaseMovePlan<T> {
	const lockedIds = new Set(locked.map((testCase) => testCase.id));
	const missingIds = [...new Set(caseIds)].filter((id) => !lockedIds.has(id));
	const movable = locked.filter(
		(testCase) => testCase.moduleId !== targetModuleId
	);
	const unchanged = locked.filter(
		(testCase) => testCase.moduleId === targetModuleId
	);
	movable.sort(
		(left, right) =>
			left.moduleId.localeCompare(right.moduleId) ||
			left.sortOrder - right.sortOrder
	);
	return { missingIds, movable, unchanged };
}

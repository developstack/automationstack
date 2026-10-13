const COUNT_FORMAT = new Intl.NumberFormat("en-US");

export function formatCount(value: number): string {
	return COUNT_FORMAT.format(value);
}

interface OverviewSummaryInput {
	staleTotal: number;
	thresholdDays: number;
	totalCases: number;
}

export function overviewSummary({
	staleTotal,
	thresholdDays,
	totalCases,
}: OverviewSummaryInput): string {
	if (totalCases === 0) {
		return "本项目还没有用例";
	}
	const total = `本项目 ${formatCount(totalCases)} 条用例`;
	if (staleTotal === 0) {
		return `${total}，P0/P1 用例都在 ${thresholdDays} 天内更新过`;
	}
	return `${total}，其中 ${formatCount(staleTotal)} 条 P0/P1 用例超过 ${thresholdDays} 天没有更新`;
}

export const MATRIX_MAX_CELLS = 200;

export interface MatrixCells {
	activeCells: number;
	casesPerCell: number;
	otherCells: number;
}

interface MatrixCellsInput {
	activeCount: number;
	caseCount: number;
}

/** 模块覆盖的方格：200 条以内一个方格一条用例，超过时一个方格表示多条用例。 */
export function matrixCells({
	activeCount,
	caseCount,
}: MatrixCellsInput): MatrixCells {
	const casesPerCell = Math.max(1, Math.ceil(caseCount / MATRIX_MAX_CELLS));
	const cellTotal = Math.ceil(caseCount / casesPerCell);
	const hasOther = caseCount > activeCount;
	let activeCells = Math.round(activeCount / casesPerCell);
	if (activeCount > 0) {
		activeCells = Math.max(1, activeCells);
	}
	if (hasOther) {
		activeCells = Math.min(cellTotal - 1, activeCells);
	}
	return { activeCells, casesPerCell, otherCells: cellTotal - activeCells };
}

interface TreeNode {
	moduleId: string;
	parentId: string | null;
}

/** 按树的先序排列模块。同级保持原顺序；找不到父模块的模块放在第一层。 */
export function orderModuleTree<T extends TreeNode>(
	modules: readonly T[]
): (T & { depth: number })[] {
	const ids = new Set(modules.map((module) => module.moduleId));
	const children = new Map<string | null, T[]>();
	for (const module of modules) {
		const parent =
			module.parentId !== null && ids.has(module.parentId)
				? module.parentId
				: null;
		const siblings = children.get(parent) ?? [];
		siblings.push(module);
		children.set(parent, siblings);
	}

	const ordered: (T & { depth: number })[] = [];
	const visit = (parent: string | null, depth: number): void => {
		for (const module of children.get(parent) ?? []) {
			ordered.push({ ...module, depth });
			visit(module.moduleId, depth + 1);
		}
	};
	visit(null, 0);
	return ordered;
}

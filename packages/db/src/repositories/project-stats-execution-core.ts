import type { CasePriority } from "../schema/test-cases";
import type { TestRunCaseResult } from "../schema/test-run-enums";
import {
	EXECUTION_WINDOW_DAYS,
	isExecuted,
	isHighPriority,
	isWithinDays,
	UNEXECUTED_CASE_LIMIT,
	UNEXECUTED_HIGH_PRIORITY_DAYS,
	UNEXECUTED_MODULE_LIMIT,
} from "./project-stats-definitions";

/** 一条生效用例。 */
export interface CoverageCaseRow {
	id: string;
	moduleId: string;
	priority: CasePriority;
}

/** 一条用例在某个执行结果下最后一次的执行时间。 */
export interface CoverageExecutionRow {
	caseId: string;
	lastAt: Date;
	result: TestRunCaseResult;
}

export interface CoverageModuleRow {
	id: string;
	name: string;
	parentId: string | null;
}

export interface UnexecutedModule {
	moduleId: string;
	name: string;
	unexecutedCount: number;
}

export interface UnexecutedCase {
	id: string;
	lastExecutedAt: Date | null;
	moduleId: string;
	priority: CasePriority;
}

export interface ExecutionCoverageCore {
	activeCount: number;
	executedCount: number;
	highPriorityActiveCount: number;
	highPriorityExecutedCount: number;
	modules: UnexecutedModule[];
	unexecutedHighPriority: { items: UnexecutedCase[]; total: number };
	unexecutedModuleCount: number;
}

export interface ExecutionCoverageInput {
	/** 当前用例状态是生效的用例。 */
	cases: readonly CoverageCaseRow[];
	executions: readonly CoverageExecutionRow[];
	/** 项目的模块，按模块树的顺序。 */
	modules: readonly CoverageModuleRow[];
	now: Date;
}

/** 每条用例上次已执行（通过或失败）的时间。阻塞和跳过不算已执行。 */
function lastExecutedByCase(
	executions: readonly CoverageExecutionRow[]
): Map<string, Date> {
	const lastExecuted = new Map<string, Date>();
	for (const { caseId, lastAt, result } of executions) {
		const previous = lastExecuted.get(caseId);
		if (isExecuted(result) && (previous === undefined || lastAt > previous)) {
			lastExecuted.set(caseId, lastAt);
		}
	}
	return lastExecuted;
}

/** 每个模块所在的第一层模块。找不到父模块时，把这个模块当作第一层模块。 */
function rootModuleIds(
	modules: readonly CoverageModuleRow[]
): Map<string, string> {
	const byId = new Map(modules.map((module) => [module.id, module]));
	const roots = new Map<string, string>();
	for (const module of modules) {
		let current = module;
		const visited = new Set<string>([current.id]);
		let parent =
			current.parentId === null ? undefined : byId.get(current.parentId);
		while (parent !== undefined && !visited.has(parent.id)) {
			visited.add(parent.id);
			current = parent;
			parent =
				current.parentId === null ? undefined : byId.get(current.parentId);
		}
		roots.set(module.id, current.id);
	}
	return roots;
}

function rankUnexecutedModules(
	unexecutedCases: readonly CoverageCaseRow[],
	modules: readonly CoverageModuleRow[]
): UnexecutedModule[] {
	const roots = rootModuleIds(modules);
	const counts = new Map<string, number>();
	for (const testCase of unexecutedCases) {
		const rootId = roots.get(testCase.moduleId) ?? testCase.moduleId;
		counts.set(rootId, (counts.get(rootId) ?? 0) + 1);
	}
	const ranked: UnexecutedModule[] = [];
	for (const module of modules) {
		const unexecutedCount = counts.get(module.id) ?? 0;
		if (unexecutedCount > 0) {
			ranked.push({ moduleId: module.id, name: module.name, unexecutedCount });
		}
	}
	// Array.prototype.sort 是稳定排序：条数相同时保持模块树的顺序
	return ranked.sort((a, b) => b.unexecutedCount - a.unexecutedCount);
}

/** 从来没有执行的排在最前面，再按上次执行时间从早到晚。 */
function compareLastExecuted(a: UnexecutedCase, b: UnexecutedCase): number {
	if (a.lastExecutedAt === null || b.lastExecutedAt === null) {
		return (
			(a.lastExecutedAt === null ? 0 : 1) - (b.lastExecutedAt === null ? 0 : 1)
		);
	}
	return a.lastExecutedAt.getTime() - b.lastExecutedAt.getTime();
}

function listUnexecutedHighPriority(
	cases: readonly CoverageCaseRow[],
	lastExecuted: Map<string, Date>,
	now: Date
): ExecutionCoverageCore["unexecutedHighPriority"] {
	const stale: UnexecutedCase[] = [];
	for (const testCase of cases) {
		const lastExecutedAt = lastExecuted.get(testCase.id) ?? null;
		const recent =
			lastExecutedAt !== null &&
			isWithinDays(lastExecutedAt, now, UNEXECUTED_HIGH_PRIORITY_DAYS);
		if (isHighPriority(testCase.priority) && !recent) {
			stale.push({ ...testCase, lastExecutedAt });
		}
	}
	stale.sort(compareLastExecuted);
	return { items: stale.slice(0, UNEXECUTED_CASE_LIMIT), total: stale.length };
}

/** M4 执行覆盖率：过去 30 天已执行的生效用例占比、按第一层模块的缺口和待执行的 P0/P1 用例。 */
export function buildExecutionCoverage({
	cases,
	executions,
	modules,
	now,
}: ExecutionCoverageInput): ExecutionCoverageCore {
	const lastExecuted = lastExecutedByCase(executions);
	const isCovered = (testCase: CoverageCaseRow): boolean => {
		const at = lastExecuted.get(testCase.id);
		return at !== undefined && isWithinDays(at, now, EXECUTION_WINDOW_DAYS);
	};
	const covered = cases.filter(isCovered);
	const highPriority = cases.filter((testCase) =>
		isHighPriority(testCase.priority)
	);
	const ranked = rankUnexecutedModules(
		cases.filter((testCase) => !isCovered(testCase)),
		modules
	);
	return {
		activeCount: cases.length,
		executedCount: covered.length,
		highPriorityActiveCount: highPriority.length,
		highPriorityExecutedCount: highPriority.filter(isCovered).length,
		modules: ranked.slice(0, UNEXECUTED_MODULE_LIMIT),
		unexecutedHighPriority: listUnexecutedHighPriority(
			cases,
			lastExecuted,
			now
		),
		unexecutedModuleCount: ranked.length,
	};
}

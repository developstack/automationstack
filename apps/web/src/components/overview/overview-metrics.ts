import type { ModuleCoverageGap } from "@automationstack/db/repositories/project-stats-coverage";
import {
	EXECUTION_WINDOW_DAYS,
	RECENT_WINDOW_DAYS,
	STALLED_RUN_DAYS,
	TREND_BUCKET_COUNT,
	TREND_BUCKET_DAYS,
} from "@automationstack/db/repositories/project-stats-definitions";
import type { ActiveRunsStats } from "@automationstack/db/repositories/project-stats-runs-core";

/** 趋势图的一个区间，例如「7 天区间」。 */
export const TREND_BUCKET_TEXT = `${TREND_BUCKET_DAYS} 天区间`;

/** 趋势图的全部区间，例如「过去 12 个 7 天区间」。 */
export const TREND_SPAN_TEXT = `过去 ${TREND_BUCKET_COUNT} 个 ${TREND_BUCKET_TEXT}`;

const COUNT_FORMAT = new Intl.NumberFormat("en-US");

const PERCENT = 100;

export function formatCount(value: number): string {
	return COUNT_FORMAT.format(value);
}

/** 整数百分比。分母为 0 时是 0。 */
export function sharePercent(part: number, total: number): number {
	return total === 0 ? 0 : Math.round((part / total) * PERCENT);
}

interface OverviewSummaryInput {
	activeCount: number;
	activeRunCount: number;
	executedCount: number;
	stalledRunCount: number;
	totalCases: number;
}

function casesClause(activeCount: number, executedCount: number): string {
	if (activeCount === 0) {
		return "还没有生效用例";
	}
	const rate = sharePercent(executedCount, activeCount);
	return `生效用例 ${formatCount(activeCount)} 条，过去 ${EXECUTION_WINDOW_DAYS} 天执行了 ${rate}%`;
}

function runsClause(activeRunCount: number, stalledRunCount: number): string {
	if (activeRunCount === 0) {
		return "没有进行中的测试任务";
	}
	const active = `${formatCount(activeRunCount)} 个测试任务进行中`;
	if (stalledRunCount === 0) {
		return active;
	}
	return `${active}，${formatCount(stalledRunCount)} 个超过 ${STALLED_RUN_DAYS} 天没有新的执行结果`;
}

/** 标题下的数据概要（调研报告第 9.1 节），回答 Q1、Q4 和 Q3。 */
export function overviewSummary({
	activeCount,
	activeRunCount,
	executedCount,
	stalledRunCount,
	totalCases,
}: OverviewSummaryInput): string {
	if (totalCases === 0) {
		return "本项目还没有用例";
	}
	return `${casesClause(activeCount, executedCount)}；${runsClause(activeRunCount, stalledRunCount)}。`;
}

/** M3 卡片的说明。进行中的测试任务没有提交，也没有作废，所以条数写明不含已作废。 */
export function activeRunsDescription({
	stalledCount,
	totalCount,
}: Pick<ActiveRunsStats, "stalledCount" | "totalCount">): string {
	const total = `${formatCount(totalCount)} 个测试任务还没有提交（不含已作废）`;
	if (stalledCount === 0) {
		return `${total}，停滞的测试任务排在最前面`;
	}
	return `${total}，${formatCount(stalledCount)} 个超过 ${STALLED_RUN_DAYS} 天没有新的执行结果，排在最前面`;
}

/** 过去 7 天与前 7 天的差值。 */
export function compareWithPrevious(current: number, previous: number): string {
	const difference = current - previous;
	if (difference === 0) {
		return `与前 ${RECENT_WINDOW_DAYS} 天相同`;
	}
	const direction = difference > 0 ? "多" : "少";
	return `比前 ${RECENT_WINDOW_DAYS} 天${direction} ${formatCount(Math.abs(difference))} 条`;
}

interface RunIdleInput {
	daysSinceLastExecution: number;
	executed: boolean;
}

/** 测试任务距上次执行的天数。没有执行结果时说出创建了几天。 */
export function runIdleText({
	daysSinceLastExecution,
	executed,
}: RunIdleInput): string {
	if (!executed) {
		return `创建 ${daysSinceLastExecution} 天，还没有执行结果`;
	}
	if (daysSinceLastExecution === 0) {
		return "今天有执行结果";
	}
	return `距上次执行 ${daysSinceLastExecution} 天`;
}

const TREND_DATE_FORMAT = new Intl.DateTimeFormat("zh-CN", {
	day: "2-digit",
	month: "2-digit",
});

/** 趋势图横轴上区间的开始日期，例如 10/06。 */
export function formatTrendDate(value: Date | string): string {
	return TREND_DATE_FORMAT.format(new Date(value));
}

/** 7 天区间，例如 10/06–10/13。 */
export function formatTrendRange(
	start: Date | string,
	end: Date | string
): string {
	return `${formatTrendDate(start)}–${formatTrendDate(end)}`;
}

const DAY_FORMAT = new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium" });

/** 日期，例如 2026年7月1日。 */
export function formatDay(value: Date | string): string {
	return DAY_FORMAT.format(new Date(value));
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

interface CoverageModule extends TreeNode {
	caseCount: number;
	gap: ModuleCoverageGap | null;
	name: string;
}

export interface CoverageGapRow {
	caseCount: number;
	gap: ModuleCoverageGap;
	moduleId: string;
	/** 从第一层模块开始的路径，例如「登录 / 短信登录」。 */
	path: string;
}

/** M8：有缺口的模块。父模块和子模块都有缺口时只列出父模块。 */
export function coverageGapRows(
	modules: readonly CoverageModule[]
): CoverageGapRow[] {
	const pathStack: string[] = [];
	let coveredDepth: number | null = null;
	const rows: CoverageGapRow[] = [];
	for (const module of orderModuleTree(modules)) {
		pathStack.length = module.depth;
		pathStack.push(module.name);
		if (coveredDepth !== null && module.depth > coveredDepth) {
			continue;
		}
		coveredDepth = null;
		if (module.gap !== null) {
			coveredDepth = module.depth;
			rows.push({
				caseCount: module.caseCount,
				gap: module.gap,
				moduleId: module.moduleId,
				path: pathStack.join(" / "),
			});
		}
	}
	return rows;
}

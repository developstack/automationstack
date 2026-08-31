import type { ModuleTreeNode } from "@automationstack/api/lib/module-tree";
import type { ModuleCoverageRow } from "@automationstack/db/repositories/project-stats-coverage";

/**
 * `get_module_tree` 的返回装配：模块树 + 每个模块的覆盖数字。
 *
 * 为什么把覆盖数字塞进模块树而不是另开一个 `get_coverage` 工具：agent 无论
 * 迁移还是生成都必然要调 `get_module_tree`（它得知道往哪挂），而它接下来要
 * 回答的第一个问题就是「这块已经有多少用例了、哪儿是空的」。两件事合成一次
 * 返回，少一次往返，也少一次「该调哪个」的判断。
 *
 * 计数口径取**含子模块（子树）**，与平台概览页的覆盖卡片同一口径：中间层模块
 * 在本产品里就是文件夹，用例通常只挂叶子上，按直接挂载判缺口会把每个中间层
 * 都标成零用例。口径的完整论证在
 * `packages/db/src/repositories/project-stats-coverage.ts`。
 *
 * 纯函数、只 import type，因此配套测试不连库、不需要 `DATABASE_URL`。
 */

/** `empty` = 子树里一条用例都没有；`no-active` = 有用例但没有一条是 active。 */
export type ModuleGap = ModuleCoverageRow["gap"];

export interface FlatModule {
	/** 含子模块的 active 用例数。 */
	activeCaseCount: number;
	/** 含子模块的用例总数。 */
	caseCount: number;
	depth: number;
	gap: ModuleGap;
	id: string;
	name: string;
	parentId: string | null;
}

/** 覆盖查询没覆盖到的模块（理论上不会发生）按「零用例」处理，不静默丢行。 */
const UNKNOWN_COVERAGE = {
	activeCaseCount: 0,
	caseCount: 0,
	gap: "empty",
} as const;

function coverageOf(
	byModuleId: Map<string, ModuleCoverageRow>,
	moduleId: string
): { activeCaseCount: number; caseCount: number; gap: ModuleGap } {
	return byModuleId.get(moduleId) ?? UNKNOWN_COVERAGE;
}

function pushSubtree(
	nodes: ModuleTreeNode[],
	depth: number,
	byModuleId: Map<string, ModuleCoverageRow>,
	out: FlatModule[]
): void {
	for (const node of nodes) {
		const coverage = coverageOf(byModuleId, node.id);
		out.push({
			activeCaseCount: coverage.activeCaseCount,
			caseCount: coverage.caseCount,
			depth,
			gap: coverage.gap,
			id: node.id,
			name: node.name,
			parentId: node.parentId,
		});
		pushSubtree(node.children, depth + 1, byModuleId, out);
	}
}

/** 模块树 + 覆盖行 → 深度优先的扁平列表（树的顺序即列表的顺序）。 */
export function flattenWithCoverage(
	tree: ModuleTreeNode[],
	coverage: ModuleCoverageRow[]
): FlatModule[] {
	const byModuleId = new Map(coverage.map((row) => [row.moduleId, row]));
	const out: FlatModule[] = [];
	pushSubtree(tree, 0, byModuleId, out);
	return out;
}

/** 缺口后缀：只有有缺口时才占字，没缺口的模块一个字都不多花。 */
function gapSuffix(gap: ModuleGap): string {
	if (gap === "empty") {
		return " ← 零用例";
	}
	if (gap === "no-active") {
		return " ← 无 active 用例";
	}
	return "";
}

/** 人读的缩进大纲，每行带覆盖数字。 */
export function renderOutline(flat: FlatModule[]): string {
	if (flat.length === 0) {
		return "(project has no modules yet)";
	}
	return flat
		.map((row) => {
			const indent = "  ".repeat(row.depth);
			const counts = `${row.caseCount} cases / ${row.activeCaseCount} active`;
			return `${indent}- ${row.name} (id: ${row.id}, ${counts})${gapSuffix(row.gap)}`;
		})
		.join("\n");
}

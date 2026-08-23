import { describe, expect, it } from "vitest";

import type {
	MindmapCaseInput,
	MindmapModuleInput,
	MindmapTreeInput,
} from "./mindmap-adapter.ts";
import { toMindElixirData } from "./mindmap-adapter.ts";
import {
	EXPANDED_CASE_WEIGHT,
	MINDMAP_EXPANDED_CASE_RESERVE,
	MINDMAP_NODE_BUDGET,
	planMindmapRender,
} from "./mindmap-budget.ts";
import { encodeModuleNodeId } from "./mindmap-node-id.ts";

function moduleOf(
	id: string,
	sortOrder: number,
	children: MindmapModuleInput[] = []
): MindmapModuleInput {
	return { children, id, name: id, sortOrder };
}

function casesFor(moduleId: string, count: number): MindmapCaseInput[] {
	return Array.from({ length: count }, (_unused, index) => ({
		id: `${moduleId}-c${index}`,
		moduleId,
		name: `用例 ${index}`,
		priority: "P2" as const,
		sortOrder: index,
		status: "draft" as const,
		steps: [],
	}));
}

function treeOf(
	modules: MindmapModuleInput[],
	cases: MindmapCaseInput[]
): MindmapTreeInput {
	return { cases, modules, projectId: "p1", projectName: "项目" };
}

/** 渲染节点数 = 1 + 进 DOM 的模块 + 进 DOM 的用例。 */
function countRenderedNodes(input: MindmapTreeInput): number {
	const { nodeData } = toMindElixirData(input);
	const walk = (node: typeof nodeData): number => {
		if (node.expanded === false) {
			return 1;
		}
		let total = 1;
		for (const child of node.children ?? []) {
			total += walk(child);
		}
		return total;
	};
	return walk(nodeData);
}

/** 一条 module → module 的链，两级模块。 */
const NESTED_MODULE_COUNT = 2;
const NESTED_DEPTH = 2;
/** 挂在最深一级模块上、刚好装得下的用例数。 */
const FITTING_CASE_COUNT = 100;
/** 根 + 1 个模块 + FITTING_CASE_COUNT 条折叠用例。 */
const FLAT_RENDERED_COUNT = 1 + 1 + FITTING_CASE_COUNT;
/** 模块被整层放弃时只剩下根 + 一级模块。 */
const ROOT_PLUS_TOP_MODULE = 2;

/** 超预算但模块本身还画得下：40 个二级模块 × 50 条用例。 */
const WIDE_SUB_COUNT = 40;
const WIDE_CASES_PER_SUB = 50;
/** 贪心至少要用掉这么多预算，否则说明它是整层放弃而不是逐个决策。 */
const BUDGET_HALVES = 2;
const MIN_GREEDY_BUDGET_USE = MINDMAP_NODE_BUDGET / BUDGET_HALVES;

/** 光模块就超预算的规模。 */
const MODULE_ONLY_OVERFLOW = 2000;
/** 多到连一级模块都摊不开的规模。 */
const MODULE_FLOOD = 5000;

/** 广度优先用例：4 个一级模块，各带 1 个空的二级模块和 200 条用例。 */
const BREADTH_TOP_COUNT = 4;
const BREADTH_CASES_PER_TOP = 200;
/** 4 个一级 + 各自 1 个二级，全部展开。 */
const BREADTH_EXPANDED_MODULES = 8;

/** 模块树上找不到的孤儿用例数。 */
const ORPHAN_CASE_COUNT = 30;

function wideSubs(): MindmapModuleInput[] {
	return Array.from({ length: WIDE_SUB_COUNT }, (_u, i) =>
		moduleOf(`s${i}`, i)
	);
}

/** 一棵稳定超预算的树：top 下挂 WIDE_SUB_COUNT 个各带 50 条用例的子模块。 */
function wideTree(subs: MindmapModuleInput[] = wideSubs()): MindmapTreeInput {
	return treeOf(
		[moduleOf("top", 0, subs)],
		subs.flatMap((sub) => casesFor(sub.id, WIDE_CASES_PER_SUB))
	);
}

describe("planMindmapRender 预算够用时", () => {
	it("expands everything when the project fits the budget", () => {
		const modules = [moduleOf("m1", 0, [moduleOf("m2", 0)])];
		const input = treeOf(modules, casesFor("m2", FITTING_CASE_COUNT));
		const plan = planMindmapRender(input);

		expect(plan.limited).toBe(false);
		expect(plan.expandedModuleIds).toEqual(new Set(["m1", "m2"]));
		expect(plan.renderedNodeCount).toBe(plan.totalNodeCount);
		expect(plan.renderedNodeCount).toBe(
			1 + NESTED_MODULE_COUNT + FITTING_CASE_COUNT
		);
		expect(plan.expandDepth).toBe(NESTED_DEPTH);
	});

	it("does not cry 'over budget' over cases whose module is missing", () => {
		// 孤儿用例（moduleId 不在模块树上）画不出来，但也不是被预算折叠的。
		const input = treeOf(
			[moduleOf("m1", 0)],
			casesFor("ghost", ORPHAN_CASE_COUNT)
		);
		const plan = planMindmapRender(input);

		expect(plan.limited).toBe(false);
		expect(plan.expandedModuleIds).toEqual(new Set(["m1"]));
	});

	it("handles a project with no modules at all", () => {
		const plan = planMindmapRender(treeOf([], []));

		expect(plan.limited).toBe(false);
		expect(plan.renderedNodeCount).toBe(1);
		expect(plan.totalNodeCount).toBe(1);
		expect(plan.expandDepth).toBe(0);
	});
});

describe("planMindmapRender 超预算时的降级", () => {
	it("keeps the rendered tree inside the budget for a huge project", () => {
		const input = wideTree();
		const plan = planMindmapRender(input);

		expect(plan.totalNodeCount).toBe(
			1 + (1 + WIDE_SUB_COUNT) + WIDE_SUB_COUNT * WIDE_CASES_PER_SUB
		);
		expect(plan.limited).toBe(true);
		expect(plan.renderedNodeCount).toBeLessThanOrEqual(MINDMAP_NODE_BUDGET);
		// 逐个模块决策必须把预算用起来，而不是整层放弃。
		expect(plan.renderedNodeCount).toBeGreaterThan(MIN_GREEDY_BUDGET_USE);
	});

	it("degrades to a shallow module skeleton when modules alone blow the budget", () => {
		// 2000 个二级模块：光模块就超预算，只能展开到一级。
		const subs = Array.from({ length: MODULE_ONLY_OVERFLOW }, (_u, i) =>
			moduleOf(`s${i}`, i)
		);
		const input = treeOf([moduleOf("top", 0, subs)], []);
		const plan = planMindmapRender(input);

		expect(plan.expandDepth).toBe(0);
		expect(plan.expandedModuleIds.size).toBe(0);
		expect(plan.renderedNodeCount).toBe(ROOT_PLUS_TOP_MODULE);
		expect(plan.limited).toBe(true);
	});
});

describe("planMindmapRender 的展开顺序", () => {
	it("expands breadth-first: every sibling before going deeper", () => {
		const tops = Array.from({ length: BREADTH_TOP_COUNT }, (_u, i) =>
			moduleOf(`t${i}`, i, [moduleOf(`t${i}-a`, 0)])
		);
		const cases = tops.flatMap((top) =>
			casesFor(top.id, BREADTH_CASES_PER_TOP)
		);
		const plan = planMindmapRender(treeOf(tops, cases));

		// 每个一级模块要 201 个节点，1 + 4 + 4*201 = 809 ≤ 1200，四个都展开；
		// 二级模块是空的，展开它们不花预算，所以也全在。
		expect(plan.expandedModuleIds.size).toBe(BREADTH_EXPANDED_MODULES);
		expect(plan.renderedNodeCount).toBe(
			1 + BREADTH_TOP_COUNT + BREADTH_TOP_COUNT * (1 + BREADTH_CASES_PER_TOP)
		);
	});
});

describe("planMindmapRender 的手动展开额度", () => {
	it("prices one expanded case at EXPANDED_CASE_WEIGHT collapsed nodes", () => {
		const input = treeOf(
			[moduleOf("m1", 0)],
			casesFor("m1", FITTING_CASE_COUNT)
		);
		const plan = planMindmapRender(input);

		expect(plan.renderedNodeCount).toBe(FLAT_RENDERED_COUNT);
		expect(plan.expandedCaseAllowance).toBe(
			Math.floor(
				(MINDMAP_NODE_BUDGET - FLAT_RENDERED_COUNT) / EXPANDED_CASE_WEIGHT
			)
		);
	});

	it("always keeps room for the cases the user opened by hand", () => {
		// 没有预留的话，贪心会把预算花到 1199，额度归零，
		// 队友一保存就把用户自己展开的步骤全收起来。
		const plan = planMindmapRender(wideTree());

		expect(plan.expandedCaseAllowance).toBeGreaterThanOrEqual(
			MINDMAP_EXPANDED_CASE_RESERVE
		);
		// 预留没有把总预算撑破：折叠节点 + 展开用例的等价成本仍在预算内。
		expect(
			plan.renderedNodeCount + plan.expandedCaseAllowance * EXPANDED_CASE_WEIGHT
		).toBeLessThanOrEqual(MINDMAP_NODE_BUDGET);
	});

	it("never hands out a negative expanded-case allowance", () => {
		const input = treeOf(
			Array.from({ length: MODULE_FLOOD }, (_u, i) => moduleOf(`m${i}`, i)),
			[]
		);
		expect(planMindmapRender(input).expandedCaseAllowance).toBe(0);
	});
});

describe("toMindElixirData honours the plan", () => {
	it("collapses exactly the modules the plan left out", () => {
		const subs = wideSubs();
		const input = wideTree(subs);
		const plan = planMindmapRender(input);
		const { nodeData } = toMindElixirData(input, plan);
		const topModule = nodeData.children?.[0];

		expect(topModule?.expanded).toBe(plan.expandedModuleIds.has("top"));
		for (const sub of subs) {
			const drawn = topModule?.children?.find(
				(child) => child.id === encodeModuleNodeId(sub.id)
			);
			expect(drawn?.expanded).toBe(plan.expandedModuleIds.has(sub.id));
		}
		// 折叠不等于砍数据：整棵树仍然在 nodeData 里，用户点开就能看到。
		expect(topModule?.children?.length).toBe(WIDE_SUB_COUNT);
	});

	it("renders no more DOM nodes than the plan promised", () => {
		const input = wideTree();
		expect(countRenderedNodes(input)).toBe(
			planMindmapRender(input).renderedNodeCount
		);
		expect(countRenderedNodes(input)).toBeLessThanOrEqual(MINDMAP_NODE_BUDGET);
	});
});

import type { ModuleTreeNode } from "@automationstack/api/lib/module-tree";

import type { RunCaseDetail } from "@/components/test-runs/run-execution-meta";

/**
 * 测试任务左栏的一组用例：一个模块的用例，加上它的子模块分组。
 */
export interface RunCaseGroup {
	/** 本模块与子模块的用例总数，显示在模块行右侧 */
	caseCount: number;
	/** 直接挂在本模块的用例，保持测试任务里的顺序 */
	cases: readonly RunCaseDetail[];
	children: readonly RunCaseGroup[];
	moduleId: string;
	moduleName: string;
}

function groupCasesByModule(
	cases: readonly RunCaseDetail[]
): Map<string, RunCaseDetail[]> {
	const byModule = new Map<string, RunCaseDetail[]>();
	for (const item of cases) {
		const list = byModule.get(item.testCase.moduleId) ?? [];
		list.push(item);
		byModule.set(item.testCase.moduleId, list);
	}
	return byModule;
}

function groupNode(
	node: ModuleTreeNode,
	byModule: ReadonlyMap<string, RunCaseDetail[]>,
	visited: Set<string>
): RunCaseGroup | null {
	visited.add(node.id);
	const own = byModule.get(node.id) ?? [];
	const children: RunCaseGroup[] = [];
	for (const child of node.children) {
		const group = groupNode(child, byModule, visited);
		if (group !== null) {
			children.push(group);
		}
	}
	if (own.length === 0 && children.length === 0) {
		return null;
	}
	const childCount = children.reduce(
		(total, group) => total + group.caseCount,
		0
	);
	return {
		caseCount: own.length + childCount,
		cases: own,
		children,
		moduleId: node.id,
		moduleName: node.name,
	};
}

/**
 * 用例按模块树分组。只保留子树里有用例的模块，所以没有用例的空模块不会
 * 占一行；层级和顺序都跟模块树一致。用例的模块不在树里时（例如模块树还是
 * 旧的），这些用例单独成组排在最后，不会从列表里消失。
 */
export function buildRunCaseGroups(
	cases: readonly RunCaseDetail[],
	tree: readonly ModuleTreeNode[]
): RunCaseGroup[] {
	const byModule = groupCasesByModule(cases);
	const visited = new Set<string>();
	const groups: RunCaseGroup[] = [];
	for (const node of tree) {
		const group = groupNode(node, byModule, visited);
		if (group !== null) {
			groups.push(group);
		}
	}
	for (const [moduleId, list] of byModule) {
		if (visited.has(moduleId)) {
			continue;
		}
		groups.push({
			caseCount: list.length,
			cases: list,
			children: [],
			moduleId,
			moduleName: list[0]?.testCase.moduleName ?? moduleId,
		});
	}
	return groups;
}

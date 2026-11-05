import type { ModuleTreeNode } from "@automationstack/api/lib/module-tree";
import { describe, expect, it } from "vitest";

import {
	buildRunCaseGroups,
	type RunCaseGroup,
} from "@/components/test-runs/run-case-groups";
import type { RunCaseDetail } from "@/components/test-runs/run-execution-meta";

function node(
	id: string,
	children: ModuleTreeNode[] = [],
	parentId: string | null = null
): ModuleTreeNode {
	return {
		children,
		id,
		name: id,
		parentId,
		projectId: "p1",
		sortOrder: 0,
	};
}

function detail(id: string, moduleId: string): RunCaseDetail {
	return {
		runCase: { assigneeId: null, id, result: "untested" },
		testCase: {
			id: `case-${id}`,
			moduleId,
			moduleName: moduleId,
			name: id,
			priority: "P2",
		},
	} as unknown as RunCaseDetail;
}

function idsOf(group: RunCaseGroup): string[] {
	return group.cases.map((item) => item.runCase.id);
}

const tree: ModuleTreeNode[] = [
	node("root", [node("child", [node("grand", [], "child")], "root")]),
	node("other", [node("other-child", [], "other")]),
	node("empty"),
];

describe("buildRunCaseGroups", () => {
	it("keeps the module tree order and nests child modules", () => {
		const groups = buildRunCaseGroups(
			[detail("g1", "grand"), detail("o1", "other")],
			tree
		);

		expect(groups.map((group) => group.moduleId)).toEqual(["root", "other"]);
		expect(groups[0]?.children.map((group) => group.moduleId)).toEqual([
			"child",
		]);
		expect(groups[0]?.children[0]?.children[0]?.moduleId).toBe("grand");
		expect(idsOf(groups[0]?.children[0]?.children[0] as RunCaseGroup)).toEqual([
			"g1",
		]);
	});

	it("drops modules whose subtree has no case", () => {
		const groups = buildRunCaseGroups([detail("o1", "other")], tree);

		expect(groups.map((group) => group.moduleId)).toEqual(["other"]);
		expect(groups[0]?.children).toEqual([]);
	});

	it("returns nothing for an empty case list", () => {
		expect(buildRunCaseGroups([], tree)).toEqual([]);
	});

	it("counts the whole subtree on the parent group", () => {
		const groups = buildRunCaseGroups(
			[detail("c1", "child"), detail("g1", "grand"), detail("g2", "grand")],
			tree
		);
		const [rootGroup] = groups;

		expect(rootGroup?.caseCount).toBe(3);
		expect(rootGroup?.cases).toEqual([]);
		expect(rootGroup?.children[0]?.caseCount).toBe(3);
		expect(rootGroup?.children[0]?.children[0]?.caseCount).toBe(2);
	});

	it("keeps the order of the cases inside a module", () => {
		const groups = buildRunCaseGroups(
			[detail("b", "other"), detail("a", "other")],
			tree
		);

		expect(idsOf(groups[0] as RunCaseGroup)).toEqual(["b", "a"]);
	});

	it("appends cases whose module is not in the tree instead of losing them", () => {
		const groups = buildRunCaseGroups(
			[detail("o1", "other"), detail("stale", "removed-module")],
			tree
		);

		expect(groups.map((group) => group.moduleId)).toEqual([
			"other",
			"removed-module",
		]);
		expect(idsOf(groups[1] as RunCaseGroup)).toEqual(["stale"]);
	});
});

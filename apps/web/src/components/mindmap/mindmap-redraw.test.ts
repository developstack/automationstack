import type { NodeObj } from "mind-elixir";
import { describe, expect, it } from "vitest";

import { encodeCaseNodeId, encodeModuleNodeId } from "./mindmap-node-id.ts";
import { applyExpandedCases } from "./mindmap-redraw.ts";

function caseNode(id: string, withSteps = true): NodeObj {
	const node: NodeObj = { id: encodeCaseNodeId(id), topic: id };
	return withSteps
		? { ...node, children: [{ id: `s:${id}:s1`, topic: "步骤" }] }
		: node;
}

function treeWith(children: NodeObj[]): NodeObj {
	return {
		children: [
			{ children, expanded: true, id: encodeModuleNodeId("m1"), topic: "模块" },
		],
		expanded: true,
		id: "p:p1",
		topic: "项目",
	};
}

/** 远大于测试里用例数的额度：预算永远不是这些用例的瓶颈。 */
const AMPLE_ALLOWANCE = 10;
/** 用户开着 5 个用例。 */
const OPEN_CASE_IDS = ["c1", "c2", "c3", "c4", "c5"];
/** 预算只放行其中 2 个。 */
const TIGHT_ALLOWANCE = 2;
/** 于是剩下 3 个只能被收起来。 */
const DROPPED_BY_TIGHT_ALLOWANCE = 3;

describe("applyExpandedCases 恢复用户展开的用例", () => {
	it("reopens the cases the user had open", () => {
		const tree = treeWith([caseNode("c1"), caseNode("c2"), caseNode("c3")]);
		const dropped = applyExpandedCases(
			tree,
			[encodeCaseNodeId("c1"), encodeCaseNodeId("c3")],
			AMPLE_ALLOWANCE
		);

		expect(dropped).toBe(0);
		const [first, second, third] = tree.children?.[0].children ?? [];
		expect(first.expanded).toBe(true);
		expect(second.expanded).toBeUndefined();
		expect(third.expanded).toBe(true);
	});

	it("ignores ids that vanished from the new tree", () => {
		const tree = treeWith([caseNode("c1")]);
		const dropped = applyExpandedCases(
			tree,
			[encodeCaseNodeId("c1"), encodeCaseNodeId("gone")],
			AMPLE_ALLOWANCE
		);

		expect(dropped).toBe(0);
		expect(tree.children?.[0].children?.[0].expanded).toBe(true);
	});
});

describe("applyExpandedCases 受预算额度约束", () => {
	it("stops at the budget allowance and reports what it dropped", () => {
		const tree = treeWith(OPEN_CASE_IDS.map((id) => caseNode(id)));
		const dropped = applyExpandedCases(
			tree,
			OPEN_CASE_IDS.map(encodeCaseNodeId),
			TIGHT_ALLOWANCE
		);

		expect(dropped).toBe(DROPPED_BY_TIGHT_ALLOWANCE);
		const opened = (tree.children?.[0].children ?? []).filter(
			(node) => node.expanded === true
		);
		expect(opened).toHaveLength(TIGHT_ALLOWANCE);
	});

	it("does nothing when the user had nothing open", () => {
		const tree = treeWith([caseNode("c1")]);
		expect(applyExpandedCases(tree, [], 0)).toBe(0);
		expect(tree.children?.[0].children?.[0].expanded).toBeUndefined();
	});

	it("treats a zero allowance as 'restore nothing'", () => {
		const tree = treeWith([caseNode("c1")]);
		expect(applyExpandedCases(tree, [encodeCaseNodeId("c1")], 0)).toBe(1);
		expect(tree.children?.[0].children?.[0].expanded).toBeUndefined();
	});
});

describe("applyExpandedCases 跳过没有步骤的用例", () => {
	it("never marks a childless case as expanded", () => {
		// 没有步骤的用例是纯叶子，展开它只会画出一个空的 me-children。
		const tree = treeWith([caseNode("c1", false)]);
		const dropped = applyExpandedCases(
			tree,
			[encodeCaseNodeId("c1")],
			AMPLE_ALLOWANCE
		);

		expect(dropped).toBe(0);
		expect(tree.children?.[0].children?.[0].expanded).toBeUndefined();
	});
});

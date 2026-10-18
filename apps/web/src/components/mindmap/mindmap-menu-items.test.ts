import type { NodeObj, Topic } from "mind-elixir";
import { describe, expect, it, vi } from "vitest";

import { createMindmapGuards } from "./mindmap-guards.ts";
import {
	MINDMAP_MENU_ITEM as ITEM,
	listMindmapMenuItems,
	type MindmapMenuContext,
} from "./mindmap-menu-items.ts";
import {
	encodeCaseNodeId,
	encodeExpectedNodeId,
	encodeModuleNodeId,
	encodeProjectNodeId,
	encodeStepNodeId,
} from "./mindmap-node-id.ts";
import { createMindmapScope } from "./mindmap-scope.ts";

const PROJECT_ID = "project-1";
const FULL_SCOPE = createMindmapScope(PROJECT_ID, undefined);
const MODULE_SCOPE = createMindmapScope(PROJECT_ID, "m1");

/** 建一个节点并挂到父节点的 children 末尾 */
function nodeOf(id: string, parent?: NodeObj): NodeObj {
	const node: NodeObj = { id, topic: "节点" };
	if (parent !== undefined) {
		node.parent = parent;
		parent.children = [...(parent.children ?? []), node];
	}
	return node;
}

/**
 * 项目根下有模块 m1、m2、m3；m2 下有子模块 m4 和用例 c1、c2、c3；
 * c2 下有步骤 s1，s1 下有预期 x1。
 */
function buildTree() {
	const project = nodeOf(encodeProjectNodeId(PROJECT_ID));
	const m1 = nodeOf(encodeModuleNodeId("m1"), project);
	const m2 = nodeOf(encodeModuleNodeId("m2"), project);
	const m3 = nodeOf(encodeModuleNodeId("m3"), project);
	const m4 = nodeOf(encodeModuleNodeId("m4"), m2);
	const c1 = nodeOf(encodeCaseNodeId("c1"), m2);
	const c2 = nodeOf(encodeCaseNodeId("c2"), m2);
	const c3 = nodeOf(encodeCaseNodeId("c3"), m2);
	const s1 = nodeOf(encodeStepNodeId("c2", "s1"), c2);
	const x1 = nodeOf(encodeExpectedNodeId("c2", "s1"), s1);
	return { c1, c2, c3, m1, m2, m3, m4, project, s1, x1 };
}

type Tree = ReturnType<typeof buildTree>;

/** 只看一个模块时，项目根下只有这个模块 */
function buildScopedTree() {
	const project = nodeOf(encodeProjectNodeId(PROJECT_ID));
	const scopeRoot = nodeOf(encodeModuleNodeId("m1"), project);
	return { project, scopeRoot };
}

function contextOf(
	node: NodeObj,
	root: NodeObj,
	overrides: Partial<MindmapMenuContext> = {}
): MindmapMenuContext {
	return {
		displayRoot: root,
		focusMode: false,
		node,
		scope: FULL_SCOPE,
		selected: [node],
		...overrides,
	};
}

const MODULE_ITEMS = [
	ITEM.addChild,
	ITEM.addSibling,
	ITEM.remove,
	ITEM.focus,
	ITEM.moveUp,
	ITEM.moveDown,
	ITEM.createCase,
	ITEM.rename,
];

describe("listMindmapMenuItems：右键菜单只列出当前节点能用的操作", () => {
	it.each<[string, (tree: Tree) => MindmapMenuContext, string[]]>([
		["中间的模块：全部操作", (t) => contextOf(t.m2, t.project), MODULE_ITEMS],
		[
			"项目根：只能插入子模块",
			(t) => contextOf(t.project, t.project),
			[ITEM.addChild],
		],
		[
			"第一个模块：没有上移",
			(t) => contextOf(t.m1, t.project),
			MODULE_ITEMS.filter((item) => item !== ITEM.moveUp),
		],
		[
			"最后一个模块：没有下移",
			(t) => contextOf(t.m3, t.project),
			MODULE_ITEMS.filter((item) => item !== ITEM.moveDown),
		],
		[
			"专注模式下的子模块：有取消专注；前面没有节点，后面是用例（模块不能排到用例后面），不能上移或下移",
			(t) => contextOf(t.m4, t.m2, { focusMode: true }),
			[
				ITEM.addChild,
				ITEM.addSibling,
				ITEM.remove,
				ITEM.focus,
				ITEM.cancelFocus,
				ITEM.createCase,
				ITEM.rename,
			],
		],
		[
			"中间的用例：没有插入子节点和新建用例",
			(t) => contextOf(t.c2, t.project),
			[
				ITEM.addSibling,
				ITEM.remove,
				ITEM.focus,
				ITEM.moveUp,
				ITEM.moveDown,
				ITEM.rename,
			],
		],
		[
			"前面是模块的用例：没有上移（用例不能排到模块前面）",
			(t) => contextOf(t.c1, t.project),
			[ITEM.addSibling, ITEM.remove, ITEM.focus, ITEM.moveDown, ITEM.rename],
		],
		["步骤：只能专注", (t) => contextOf(t.s1, t.project), [ITEM.focus]],
		["预期：只能专注", (t) => contextOf(t.x1, t.project), [ITEM.focus]],
		[
			"专注模式下专注的节点：没有同级、删除、专注和移动",
			(t) => contextOf(t.m2, t.m2, { focusMode: true }),
			[ITEM.addChild, ITEM.cancelFocus, ITEM.createCase, ITEM.rename],
		],
		[
			"多选中有步骤：没有删除",
			(t) => contextOf(t.c2, t.project, { selected: [t.c2, t.s1] }),
			[ITEM.addSibling, ITEM.focus, ITEM.moveUp, ITEM.moveDown, ITEM.rename],
		],
	])("%s", (_name, build, expected) => {
		expect(listMindmapMenuItems(build(buildTree()))).toEqual(new Set(expected));
	});

	it.each<
		[string, (tree: ReturnType<typeof buildScopedTree>) => NodeObj, string[]]
	>([
		["只看一个模块时的项目根：没有可用的操作", (t) => t.project, []],
		[
			"只看一个模块时的根模块：不能插入同级，不能删除",
			(t) => t.scopeRoot,
			[ITEM.addChild, ITEM.focus, ITEM.createCase, ITEM.rename],
		],
	])("%s", (_name, pick, expected) => {
		const tree = buildScopedTree();
		const context = contextOf(pick(tree), tree.project, {
			scope: MODULE_SCOPE,
		});
		expect(listMindmapMenuItems(context)).toEqual(new Set(expected));
	});
});

describe("菜单与 createMindmapGuards 使用相同的规则", () => {
	const topicOf = (node: NodeObj) => ({ nodeObj: node }) as unknown as Topic;
	const trees = [
		{ scope: FULL_SCOPE, ...buildTree() },
		{ scope: MODULE_SCOPE, ...buildScopedTree() },
	];
	const cases = trees.flatMap(({ project, scope, ...nodes }) =>
		[project, ...Object.values(nodes)].map((node) => ({ node, project, scope }))
	);

	it.each(cases)("$node.id", async ({ node, project, scope }) => {
		const before = createMindmapGuards({
			confirmRemoval: () => Promise.resolve(true),
			getInstance: () => null,
			openCase: vi.fn(),
			reject: vi.fn(),
			scope,
			setPendingKind: vi.fn(),
		});
		const items = listMindmapMenuItems(contextOf(node, project, { scope }));
		const topic = topicOf(node);
		expect({
			addChild: before.addChild?.(topic),
			addSibling: before.insertSibling?.("after", topic),
			moveDown: before.moveDownNode?.(topic),
			moveUp: before.moveUpNode?.(topic),
			remove: await before.removeNodes?.([topic]),
		}).toEqual({
			addChild: items.has(ITEM.addChild),
			addSibling: items.has(ITEM.addSibling),
			moveDown: items.has(ITEM.moveDown),
			moveUp: items.has(ITEM.moveUp),
			remove: items.has(ITEM.remove),
		});
	});
});

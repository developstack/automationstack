import {
	buildModuleTree,
	type ModuleTreeNode,
} from "@automationstack/api/lib/module-tree";
import { expect, test } from "vitest";
import {
	CYCLE_DROP_MESSAGE,
	type ModuleDropPoint,
	makeDropId,
	parseDropId,
	ROOT_END_DROP_ID,
	resolveModuleDrop,
} from "@/components/workspace/module-drop-plan";

const PROJECT_ID = "11111111-1111-4111-8111-111111111111";

function makeNode(
	id: string,
	parentId: string | null,
	children: ModuleTreeNode[] = []
): ModuleTreeNode {
	return {
		children,
		id,
		name: id,
		parentId,
		projectId: PROJECT_ID,
		sortOrder: 0,
	};
}

function makeTree(): ModuleTreeNode[] {
	return [
		makeNode("a", null, [
			makeNode("a1", "a", [makeNode("a1x", "a1")]),
			makeNode("a2", "a"),
			makeNode("a3", "a"),
		]),
		makeNode("b", null),
		makeNode("c", null),
		makeNode("d", null),
	];
}

const beforeDrop = (moduleId: string): ModuleDropPoint => ({
	moduleId,
	zone: "before",
});
const insideDrop = (moduleId: string): ModuleDropPoint => ({
	moduleId,
	zone: "inside",
});
const ROOT_END_DROP: ModuleDropPoint = { moduleId: null, zone: "root-end" };
const CYCLE = { kind: "invalid", reason: CYCLE_DROP_MESSAGE };
const NOOP = { kind: "noop" };

test("makeDropId/parseDropId 对两种 zone 往返一致", () => {
	expect(makeDropId("before", "m1")).toBe("before:m1");
	expect(makeDropId("inside", "m1")).toBe("inside:m1");
	expect(parseDropId(makeDropId("before", "m1"))).toEqual(beforeDrop("m1"));
	expect(parseDropId(makeDropId("inside", "m1"))).toEqual(insideDrop("m1"));
});

test("parseDropId 识别根层级末尾落点", () => {
	expect(parseDropId(ROOT_END_DROP_ID)).toEqual(ROOT_END_DROP);
});

test("parseDropId 对非法输入返回 null", () => {
	expect(parseDropId("no-separator")).toBeNull();
	expect(parseDropId("after:m1")).toBeNull();
	expect(parseDropId(":m1")).toBeNull();
	expect(parseDropId("")).toBeNull();
});

test("parseDropId 只切第一个分隔符，id 内含冒号仍可往返", () => {
	expect(parseDropId("inside:a:b")).toEqual(insideDrop("a:b"));
	expect(parseDropId(makeDropId("before", "a:b"))).toEqual(beforeDrop("a:b"));
});

test("parseDropId 对空 moduleId 不做校验（当前行为）", () => {
	expect(parseDropId("before:")).toEqual(beforeDrop(""));
});

const move = (moduleId: string, parentId: string | null, index?: number) => ({
	index,
	kind: "move",
	moduleId,
	parentId,
});
const reorder = (parentId: string | null, orderedIds: string[]) => ({
	kind: "reorder",
	orderedIds,
	parentId,
});

test.each<[string, string, ModuleDropPoint, object]>([
	["找不到 active 时兜底为 noop", "missing", beforeDrop("b"), NOOP],
	["找不到 active 时兜底为 noop", "missing", ROOT_END_DROP, NOOP],
	["找不到 target 时兜底为 noop", "b", beforeDrop("missing"), NOOP],
	["找不到 target 时兜底为 noop", "b", insideDrop("missing"), NOOP],
	[
		"before 落点缺少 moduleId 时为 noop",
		"b",
		{ moduleId: null, zone: "before" },
		NOOP,
	],
	["before 落到自己身上为 noop", "a", beforeDrop("a"), NOOP],
	["回归：before 落到自己的直接子节点上方判为环", "a", beforeDrop("a1"), CYCLE],
	["回归：before 落到自己的直接子节点上方判为环", "a", beforeDrop("a2"), CYCLE],
	["回归：before 落到更深层子孙上方同样判为环", "a", beforeDrop("a1x"), CYCLE],
	["inside 落到自己身上为 noop", "a", insideDrop("a"), NOOP],
	["inside 落到自己的子孙上判为环", "a", insideDrop("a1"), CYCLE],
	["inside 落到自己的子孙上判为环", "a", insideDrop("a1x"), CYCLE],
	[
		"inside 落到非子孙节点上产生 move（无 index）",
		"a",
		insideDrop("b"),
		move("a", "b"),
	],
	["inside 落到自己当前的父节点上为 noop", "a1", insideDrop("a"), NOOP],
	["inside 落到自己当前的父节点上为 noop", "a1x", insideDrop("a1"), NOOP],
	[
		"inside 的早退不会误伤根层级节点之间的正常改挂",
		"b",
		insideDrop("c"),
		move("b", "c"),
	],
	[
		"inside 的早退不会误伤根层级节点之间的正常改挂",
		"a1",
		insideDrop("b"),
		move("a1", "b"),
	],
	[
		"子层级内重排返回该层级的 parentId 而不是 null",
		"a3",
		beforeDrop("a1"),
		reorder("a", ["a3", "a1", "a2"]),
	],
	[
		"子层级内重排返回该层级的 parentId 而不是 null",
		"a1",
		beforeDrop("a3"),
		reorder("a", ["a2", "a1", "a3"]),
	],
	[
		"根层级内重排返回 parentId null 与完整顺序",
		"d",
		beforeDrop("b"),
		reorder(null, ["a", "d", "b", "c"]),
	],
	["拖到紧邻的下一个兄弟之前顺序不变，返回 noop", "b", beforeDrop("c"), NOOP],
	["拖到紧邻的下一个兄弟之前顺序不变，返回 noop", "a1", beforeDrop("a2"), NOOP],
	[
		"跨级插入（根 → 子层级）返回带 index 的 move",
		"b",
		beforeDrop("a2"),
		move("b", "a", 1),
	],
	[
		"跨级插入（根 → 子层级）返回带 index 的 move",
		"b",
		beforeDrop("a1"),
		move("b", "a", 0),
	],
	[
		"跨级插入（子层级 → 根）返回 parentId null 与根层级 index",
		"a1",
		beforeDrop("b"),
		move("a1", null, 1),
	],
	[
		"root-end：active 在子层级时改挂到根（move，无 index）",
		"a1x",
		ROOT_END_DROP,
		move("a1x", null),
	],
	[
		"root-end：active 已在根层级时按重排处理",
		"b",
		ROOT_END_DROP,
		reorder(null, ["a", "c", "d", "b"]),
	],
	["root-end：active 已是根层级最后一个时为 noop", "d", ROOT_END_DROP, NOOP],
])("%s（拖动 %s）", (_name, activeId, drop, plan) => {
	expect(resolveModuleDrop(makeTree(), activeId, drop)).toEqual(plan);
});

interface NodeShape {
	children: NodeShape[];
	id: string;
}

const shapeOf = (nodes: readonly ModuleTreeNode[]): NodeShape[] =>
	nodes.map((node) => ({ children: shapeOf(node.children), id: node.id }));

const rowsFor = (ids: readonly string[], parentId: string | null) =>
	ids.map((id, sortOrder) => ({
		id,
		name: id,
		parentId,
		projectId: PROJECT_ID,
		sortOrder,
	}));

test("对 buildModuleTree 真实组装出的树给出同样的落点判定", () => {
	const tree = buildModuleTree([
		...rowsFor(["a", "b", "c", "d"], null),
		...rowsFor(["a1", "a2", "a3"], "a"),
		...rowsFor(["a1x"], "a1"),
	]);
	expect(shapeOf(tree)).toEqual(shapeOf(makeTree()));
	expect(resolveModuleDrop(tree, "a", beforeDrop("a1"))).toEqual(CYCLE);
	expect(resolveModuleDrop(tree, "a3", beforeDrop("a1"))).toEqual(
		reorder("a", ["a3", "a1", "a2"])
	);
});

test("resolveModuleDrop 不修改传入的树", () => {
	const tree = makeTree();
	resolveModuleDrop(tree, "b", beforeDrop("a1"));
	resolveModuleDrop(tree, "d", ROOT_END_DROP);
	expect(tree).toEqual(makeTree());
});

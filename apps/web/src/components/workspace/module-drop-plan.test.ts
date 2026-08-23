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

/**
 * 固定树形：
 *   a ── a1 ── a1x
 *     ├─ a2
 *     └─ a3
 *   b
 *   c
 *   d
 */
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

test("找不到 active 时兜底为 noop", () => {
	expect(resolveModuleDrop(makeTree(), "missing", beforeDrop("b"))).toEqual(
		NOOP
	);
	expect(resolveModuleDrop(makeTree(), "missing", ROOT_END_DROP)).toEqual(NOOP);
});

test("找不到 target 时兜底为 noop", () => {
	expect(resolveModuleDrop(makeTree(), "b", beforeDrop("missing"))).toEqual(
		NOOP
	);
	expect(resolveModuleDrop(makeTree(), "b", insideDrop("missing"))).toEqual(
		NOOP
	);
});

test("before 落点缺少 moduleId 时为 noop", () => {
	const drop: ModuleDropPoint = { moduleId: null, zone: "before" };
	expect(resolveModuleDrop(makeTree(), "b", drop)).toEqual(NOOP);
});

test("before 落到自己身上为 noop", () => {
	expect(resolveModuleDrop(makeTree(), "a", beforeDrop("a"))).toEqual(NOOP);
});

test("回归：before 落到自己的直接子节点上方判为环", () => {
	expect(resolveModuleDrop(makeTree(), "a", beforeDrop("a1"))).toEqual(CYCLE);
	expect(resolveModuleDrop(makeTree(), "a", beforeDrop("a2"))).toEqual(CYCLE);
});

test("回归：before 落到更深层子孙上方同样判为环", () => {
	expect(resolveModuleDrop(makeTree(), "a", beforeDrop("a1x"))).toEqual(CYCLE);
});

test("inside 落到自己身上为 noop", () => {
	expect(resolveModuleDrop(makeTree(), "a", insideDrop("a"))).toEqual(NOOP);
});

test("inside 落到自己的子孙上判为环", () => {
	expect(resolveModuleDrop(makeTree(), "a", insideDrop("a1"))).toEqual(CYCLE);
	expect(resolveModuleDrop(makeTree(), "a", insideDrop("a1x"))).toEqual(CYCLE);
});

test("inside 落到非子孙节点上产生 move（无 index）", () => {
	expect(resolveModuleDrop(makeTree(), "a", insideDrop("b"))).toEqual({
		kind: "move",
		moduleId: "a",
		parentId: "b",
	});
});

test("inside 落到自己当前的父节点上为 noop", () => {
	// 不早退的话服务端 clampIndex(undefined, total) 会把它写到同级末尾，
	// 产生用户没要求过的静默重排。
	expect(resolveModuleDrop(makeTree(), "a1", insideDrop("a"))).toEqual(NOOP);
	expect(resolveModuleDrop(makeTree(), "a1x", insideDrop("a1"))).toEqual(NOOP);
});

test("inside 的早退不会误伤根层级节点之间的正常改挂", () => {
	// active.parentId 为 null，target 是根层级另一个节点：仍然是合法 move
	expect(resolveModuleDrop(makeTree(), "b", insideDrop("c"))).toEqual({
		kind: "move",
		moduleId: "b",
		parentId: "c",
	});
	// 反向：子节点挂到别的根节点下也不受影响
	expect(resolveModuleDrop(makeTree(), "a1", insideDrop("b"))).toEqual({
		kind: "move",
		moduleId: "a1",
		parentId: "b",
	});
});

test("子层级内重排返回该层级的 parentId 而不是 null", () => {
	expect(resolveModuleDrop(makeTree(), "a3", beforeDrop("a1"))).toEqual({
		kind: "reorder",
		orderedIds: ["a3", "a1", "a2"],
		parentId: "a",
	});
	expect(resolveModuleDrop(makeTree(), "a1", beforeDrop("a3"))).toEqual({
		kind: "reorder",
		orderedIds: ["a2", "a1", "a3"],
		parentId: "a",
	});
});

test("根层级内重排返回 parentId null 与完整顺序", () => {
	expect(resolveModuleDrop(makeTree(), "d", beforeDrop("b"))).toEqual({
		kind: "reorder",
		orderedIds: ["a", "d", "b", "c"],
		parentId: null,
	});
});

test("拖到紧邻的下一个兄弟之前顺序不变，返回 noop", () => {
	expect(resolveModuleDrop(makeTree(), "b", beforeDrop("c"))).toEqual(NOOP);
	expect(resolveModuleDrop(makeTree(), "a1", beforeDrop("a2"))).toEqual(NOOP);
});

test("跨级插入（根 → 子层级）返回带 index 的 move", () => {
	expect(resolveModuleDrop(makeTree(), "b", beforeDrop("a2"))).toEqual({
		index: 1,
		kind: "move",
		moduleId: "b",
		parentId: "a",
	});
	expect(resolveModuleDrop(makeTree(), "b", beforeDrop("a1"))).toEqual({
		index: 0,
		kind: "move",
		moduleId: "b",
		parentId: "a",
	});
});

test("跨级插入（子层级 → 根）返回 parentId null 与根层级 index", () => {
	expect(resolveModuleDrop(makeTree(), "a1", beforeDrop("b"))).toEqual({
		index: 1,
		kind: "move",
		moduleId: "a1",
		parentId: null,
	});
});

test("root-end：active 在子层级时改挂到根（move，无 index）", () => {
	expect(resolveModuleDrop(makeTree(), "a1x", ROOT_END_DROP)).toEqual({
		kind: "move",
		moduleId: "a1x",
		parentId: null,
	});
});

test("root-end：active 已在根层级时按重排处理", () => {
	expect(resolveModuleDrop(makeTree(), "b", ROOT_END_DROP)).toEqual({
		kind: "reorder",
		orderedIds: ["a", "c", "d", "b"],
		parentId: null,
	});
});

test("root-end：active 已是根层级最后一个时为 noop", () => {
	expect(resolveModuleDrop(makeTree(), "d", ROOT_END_DROP)).toEqual(NOOP);
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
	expect(resolveModuleDrop(tree, "a3", beforeDrop("a1"))).toEqual({
		kind: "reorder",
		orderedIds: ["a3", "a1", "a2"],
		parentId: "a",
	});
});

test("resolveModuleDrop 不修改传入的树", () => {
	const tree = makeTree();
	resolveModuleDrop(tree, "b", beforeDrop("a1"));
	resolveModuleDrop(tree, "d", ROOT_END_DROP);
	expect(tree).toEqual(makeTree());
});

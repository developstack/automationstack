import { expect, test } from "vitest";
import {
	buildModuleTree,
	collectSubtreeIds,
	type ModuleRow,
	wouldCreateModuleCycle,
} from "./module-tree";

const PROJECT_ID = "11111111-1111-4111-8111-111111111111";

function makeRow(id: string, parentId: string | null, sortOrder: number) {
	return { id, name: id, parentId, projectId: PROJECT_ID, sortOrder };
}

function makeRows(): ModuleRow[] {
	return [
		makeRow("m1", null, 1),
		makeRow("m2", null, 0),
		makeRow("orphan", "gone", 0),
		makeRow("m1b", "m1", 1),
		makeRow("m1a", "m1", 1),
		makeRow("m1a1", "m1a", 0),
		makeRow("m1a2", "m1a", 1),
	];
}

const MUTUAL = [makeRow("c1", "c2", 0), makeRow("c2", "c1", 0)];

const idsOf = (nodes: readonly { id: string }[]): string[] =>
	nodes.map((node) => node.id);

test("buildModuleTree 按 sortOrder 排根节点，sortOrder 相同则按 id", () => {
	const roots = buildModuleTree(makeRows());
	expect(idsOf(roots)).toEqual(["m2", "orphan", "m1"]);
});

test("buildModuleTree 把 parentId 指向不存在行的节点当作根节点", () => {
	const orphan = buildModuleTree(makeRows()).find(
		(node) => node.id === "orphan"
	);
	expect(orphan?.parentId).toBe("gone");
	expect(orphan?.children).toEqual([]);
});

test("buildModuleTree 对每层子节点同样排序（sortOrder 相同回落到 id）", () => {
	const roots = buildModuleTree(makeRows());
	const m1 = roots.find((node) => node.id === "m1");
	expect(idsOf(m1?.children ?? [])).toEqual(["m1a", "m1b"]);
	const m1a = m1?.children.find((node) => node.id === "m1a");
	expect(idsOf(m1a?.children ?? [])).toEqual(["m1a1", "m1a2"]);
});

test("buildModuleTree 保留原始字段且不修改传入的行", () => {
	const rows = makeRows();
	const roots = buildModuleTree(rows);
	const m2 = roots.find((node) => node.id === "m2");
	expect(m2).toEqual({
		children: [],
		id: "m2",
		name: "m2",
		parentId: null,
		projectId: PROJECT_ID,
		sortOrder: 0,
	});
	expect(rows).toEqual(makeRows());
});

test("buildModuleTree 处理空输入", () => {
	expect(buildModuleTree([])).toEqual([]);
});

test("collectSubtreeIds 结果包含自身", () => {
	expect(collectSubtreeIds(makeRows(), "m2")).toEqual(["m2"]);
	expect(collectSubtreeIds(makeRows(), "orphan")).toEqual(["orphan"]);
});

test("collectSubtreeIds 按广度优先收集多层子孙", () => {
	expect(collectSubtreeIds(makeRows(), "m1a")).toEqual(["m1a", "m1a1", "m1a2"]);
});

test("collectSubtreeIds 的兄弟顺序取自行顺序而非 sortOrder", () => {
	expect(collectSubtreeIds(makeRows(), "m1")).toEqual([
		"m1",
		"m1b",
		"m1a",
		"m1a1",
		"m1a2",
	]);
});

test("collectSubtreeIds 对不存在的 rootId 只返回它自己（不做存在性校验）", () => {
	expect(collectSubtreeIds(makeRows(), "nope")).toEqual(["nope"]);
	expect(collectSubtreeIds([], "nope")).toEqual(["nope"]);
});

test("collectSubtreeIds 遇到环形 rows 会终止而不是死循环", () => {
	expect(collectSubtreeIds(MUTUAL, "c1")).toEqual(["c1", "c2"]);
	expect(collectSubtreeIds(MUTUAL, "c2")).toEqual(["c2", "c1"]);
	const selfLoop = [makeRow("s1", "s1", 0)];
	expect(collectSubtreeIds(selfLoop, "s1")).toEqual(["s1"]);
});

test("collectSubtreeIds 对多路径可达的同一 id 只收集一次", () => {
	const rows = [
		...makeRows(),
		makeRow("dup", "m1", 0),
		makeRow("dup", "m1a", 0),
	];
	const ids = collectSubtreeIds(rows, "m1");
	expect(ids.filter((id) => id === "dup")).toEqual(["dup"]);
	expect(new Set(ids).size).toBe(ids.length);
});

test.each<[string, ModuleRow[], [string, string | null], boolean]>([
	["在环形 rows 上能终止：挂到环内判为环", MUTUAL, ["c1", "c2"], true],
	["在环形 rows 上能终止：挂到环外合法", MUTUAL, ["c1", "outside"], false],
	[
		"移到根层级（newParentId 为 null）永远合法",
		makeRows(),
		["m1", null],
		false,
	],
	["未知 id 移到根层级也合法", makeRows(), ["nope", null], false],
	["挂到自身判为环", makeRows(), ["m1", "m1"], true],
	["没有 rows 时挂到自身也判为环", [], ["m1", "m1"], true],
	["挂到自己子树内判为环", makeRows(), ["m1", "m1a"], true],
	["挂到自己子树内判为环（多层）", makeRows(), ["m1", "m1a1"], true],
	["挂到子树外合法", makeRows(), ["m1", "m2"], false],
	["挂回祖先合法", makeRows(), ["m1a", "m1"], false],
	["挂到兄弟子树合法", makeRows(), ["m1a1", "m1b"], false],
	["挂到未知 id 合法", makeRows(), ["m1", "gone"], false],
])(
	"wouldCreateModuleCycle：%s",
	(_name, rows, [moduleId, newParentId], expected) => {
		expect(wouldCreateModuleCycle(rows, moduleId, newParentId)).toBe(expected);
	}
);

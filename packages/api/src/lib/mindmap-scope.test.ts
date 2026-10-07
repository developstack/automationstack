import type { MindmapCaseNode } from "@automationstack/db/repositories/mindmap-repository";
import { expect, test } from "vitest";

import {
	collectModuleTreeIds,
	filterCasesByModules,
	type MindmapScopeInput,
	scopeMindmapTree,
	stripCaseSteps,
} from "./mindmap-scope";
import { buildModuleTree, type ModuleRow } from "./module-tree";

const PROJECT_ID = "11111111-1111-4111-8111-111111111111";

function makeRow(id: string, parentId: string | null, sortOrder: number) {
	return { id, name: id, parentId, projectId: PROJECT_ID, sortOrder };
}

function makeRows(): ModuleRow[] {
	return [
		makeRow("m1", null, 0),
		makeRow("m2", null, 1),
		makeRow("m1a", "m1", 0),
		makeRow("m1b", "m1", 1),
		makeRow("m1a1", "m1a", 0),
	];
}

function makeCase(id: string, moduleId: string): MindmapCaseNode {
	return {
		id,
		moduleId,
		name: `case-${id}`,
		priority: "P1",
		sortOrder: 0,
		status: "active",
		steps: [{ expected: `e-${id}`, id: `${id}-s1`, step: `s-${id}` }],
	};
}

function makeCases(): MindmapCaseNode[] {
	return [
		makeCase("c-m1", "m1"),
		makeCase("c-m1a", "m1a"),
		makeCase("c-m1a1", "m1a1"),
		makeCase("c-m1b", "m1b"),
		makeCase("c-m2", "m2"),
	];
}

function makeInput(overrides: Partial<MindmapScopeInput>): MindmapScopeInput {
	return {
		cases: makeCases(),
		includeSteps: true,
		moduleId: null,
		moduleRows: makeRows(),
		...overrides,
	};
}

const idsOf = (nodes: readonly { id: string }[]): string[] =>
	nodes.map((node) => node.id);

test("缺省参数（moduleId null + includeSteps true）等价于改动前的全项目树", () => {
	const result = scopeMindmapTree(makeInput({}));
	expect(result.kind).toBe("ok");
	if (result.kind !== "ok") {
		return;
	}
	expect(result.payload).toEqual({
		cases: makeCases(),
		modules: buildModuleTree(makeRows()),
	});
});

test("缺省参数下 cases 原样透传（不复制、不改序）", () => {
	const cases = makeCases();
	const result = scopeMindmapTree(makeInput({ cases }));
	expect(result.kind === "ok" && result.payload.cases).toBe(cases);
});

test("moduleId 返回的 modules 只有该子树这一个根", () => {
	const result = scopeMindmapTree(makeInput({ moduleId: "m1a" }));
	expect(result.kind).toBe("ok");
	if (result.kind !== "ok") {
		return;
	}
	expect(idsOf(result.payload.modules)).toEqual(["m1a"]);
	expect(idsOf(result.payload.modules[0]?.children ?? [])).toEqual(["m1a1"]);
});

test("moduleId 只保留该模块及其子孙下的用例", () => {
	const result = scopeMindmapTree(makeInput({ moduleId: "m1a" }));
	expect(result.kind === "ok" && idsOf(result.payload.cases)).toEqual([
		"c-m1a",
		"c-m1a1",
	]);
});

test("moduleId 取根模块时含整棵子树的用例，但排除兄弟根", () => {
	const result = scopeMindmapTree(makeInput({ moduleId: "m1" }));
	expect(result.kind === "ok" && idsOf(result.payload.cases)).toEqual([
		"c-m1",
		"c-m1a",
		"c-m1a1",
		"c-m1b",
	]);
});

test("moduleId 取叶子模块时只剩它自己的用例", () => {
	const result = scopeMindmapTree(makeInput({ moduleId: "m1a1" }));
	expect(result.kind).toBe("ok");
	if (result.kind !== "ok") {
		return;
	}
	expect(idsOf(result.payload.modules)).toEqual(["m1a1"]);
	expect(idsOf(result.payload.cases)).toEqual(["c-m1a1"]);
});

test("moduleId 不在这批行里（如属于别的项目）返回 module-not-found 而非空树", () => {
	expect(scopeMindmapTree(makeInput({ moduleId: "other" }))).toEqual({
		kind: "module-not-found",
	});
	expect(
		scopeMindmapTree(makeInput({ moduleId: "m1", moduleRows: [] }))
	).toEqual({ kind: "module-not-found" });
});

test("includeSteps false 保留 steps 字段但置空数组，其余字段不变", () => {
	const result = scopeMindmapTree(makeInput({ includeSteps: false }));
	expect(result.kind).toBe("ok");
	if (result.kind !== "ok") {
		return;
	}
	for (const node of result.payload.cases) {
		expect(Object.hasOwn(node, "steps")).toBe(true);
		expect(node.steps).toEqual([]);
	}
	expect(idsOf(result.payload.cases)).toEqual(idsOf(makeCases()));
	expect(result.payload.cases[0]?.priority).toBe("P1");
});

test("includeSteps false 与 moduleId 可叠加", () => {
	const result = scopeMindmapTree(
		makeInput({ includeSteps: false, moduleId: "m1a" })
	);
	expect(result.kind).toBe("ok");
	if (result.kind !== "ok") {
		return;
	}
	expect(idsOf(result.payload.cases)).toEqual(["c-m1a", "c-m1a1"]);
	expect(result.payload.cases.map((node) => node.steps)).toEqual([[], []]);
});

test("裁剪不修改传入的行与用例", () => {
	const rows = makeRows();
	const cases = makeCases();
	scopeMindmapTree({
		cases,
		includeSteps: false,
		moduleId: "m1",
		moduleRows: rows,
	});
	expect(rows).toEqual(makeRows());
	expect(cases).toEqual(makeCases());
});

test("stripCaseSteps 保持键顺序，便于载荷逐字节对比", () => {
	const [node] = stripCaseSteps(makeCases());
	expect(Object.keys(node ?? {})).toEqual(Object.keys(makeCases()[0] ?? {}));
});

test("collectModuleTreeIds 含根自身与全部子孙", () => {
	const roots = buildModuleTree(makeRows());
	const m1 = roots.find((node) => node.id === "m1");
	expect(m1 && [...collectModuleTreeIds(m1)].sort()).toEqual([
		"m1",
		"m1a",
		"m1a1",
		"m1b",
	]);
	const m2 = roots.find((node) => node.id === "m2");
	expect(m2 && [...collectModuleTreeIds(m2)]).toEqual(["m2"]);
});

test("filterCasesByModules 保留输入顺序且不匹配时返回空数组", () => {
	const cases = makeCases();
	expect(idsOf(filterCasesByModules(cases, new Set(["m2", "m1"])))).toEqual([
		"c-m1",
		"c-m2",
	]);
	expect(filterCasesByModules(cases, new Set())).toEqual([]);
});

test("空项目：无模块无用例时返回空树而不是报错", () => {
	const result = scopeMindmapTree({
		cases: [],
		includeSteps: true,
		moduleId: null,
		moduleRows: [],
	});
	expect(result).toEqual({ kind: "ok", payload: { cases: [], modules: [] } });
});

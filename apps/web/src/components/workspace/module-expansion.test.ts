import type { ModuleTreeNode } from "@automationstack/api/lib/module-tree";
import { describe, expect, it } from "vitest";

import {
	countModules,
	DEFAULT_OPEN_DEPTH,
	FULL_EXPAND_MAX_MODULES,
	findModuleAncestorIds,
	isModuleOpen,
	type ModuleOpenContext,
	parseModuleOverrides,
	serializeModuleOverrides,
} from "@/components/workspace/module-expansion";

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

const tree: ModuleTreeNode[] = [
	node("root", [
		node(
			"child",
			[node("grand", [node("great", [], "grand")], "child")],
			"root"
		),
	]),
	node("other", [node("other-child", [], "other")]),
];

const TREE_SIZE = 6;
const GRANDCHILD_DEPTH = 2;
const TINY_PROJECT = 3;

function context(patch: Partial<ModuleOpenContext> = {}): ModuleOpenContext {
	return {
		ancestorIds: new Set<string>(),
		overrides: new Map<string, boolean>(),
		totalModules: FULL_EXPAND_MAX_MODULES + 1,
		...patch,
	};
}

describe("countModules", () => {
	it("counts every node in the tree", () => {
		expect(countModules(tree)).toBe(TREE_SIZE);
	});

	it("returns 0 for an empty tree", () => {
		expect(countModules([])).toBe(0);
	});
});

describe("findModuleAncestorIds", () => {
	it.each([
		[
			"returns the root-to-parent chain without the module itself",
			"great",
			["root", "child", "grand"],
		],
		["returns an empty chain for a root module", "root", []],
		[
			"does not leak the failed branch when the module sits in a later subtree",
			"other-child",
			["other"],
		],
		["returns an empty chain for unknown ids", "nope", []],
		["returns an empty chain for missing ids", undefined, []],
	])("%s", (_name, moduleId, chain) => {
		expect(findModuleAncestorIds(tree, moduleId)).toEqual(chain);
	});
});

describe("isModuleOpen", () => {
	it("expands only the root level by default", () => {
		expect(isModuleOpen(context(), "root", 0)).toBe(true);
		expect(isModuleOpen(context(), "child", DEFAULT_OPEN_DEPTH)).toBe(false);
		expect(isModuleOpen(context(), "grand", GRANDCHILD_DEPTH)).toBe(false);
	});

	it("expands the whole tree while the project stays small", () => {
		const small = context({ totalModules: FULL_EXPAND_MAX_MODULES });
		expect(isModuleOpen(small, "grand", GRANDCHILD_DEPTH)).toBe(true);
	});

	it("expands the ancestor chain of the selected module", () => {
		const deepLink = context({
			ancestorIds: new Set(findModuleAncestorIds(tree, "great")),
		});
		expect(isModuleOpen(deepLink, "child", 1)).toBe(true);
		expect(isModuleOpen(deepLink, "grand", GRANDCHILD_DEPTH)).toBe(true);
		expect(isModuleOpen(deepLink, "other-child", 1)).toBe(false);
	});

	it("lets a user override win over both defaults", () => {
		const collapsedRoot = context({ overrides: new Map([["root", false]]) });
		expect(isModuleOpen(collapsedRoot, "root", 0)).toBe(false);

		const openedDeep = context({ overrides: new Map([["grand", true]]) });
		expect(isModuleOpen(openedDeep, "grand", GRANDCHILD_DEPTH)).toBe(true);
	});

	it("keeps a user collapse in a small project", () => {
		const small = context({
			overrides: new Map([["child", false]]),
			totalModules: TINY_PROJECT,
		});
		expect(isModuleOpen(small, "child", 1)).toBe(false);
	});
});

describe("module override storage", () => {
	it("round-trips overrides through JSON", () => {
		const overrides = new Map([
			["a", true],
			["b", false],
		]);
		expect(parseModuleOverrides(serializeModuleOverrides(overrides))).toEqual(
			overrides
		);
	});

	it("falls back to an empty map for missing or broken payloads", () => {
		expect(parseModuleOverrides(null).size).toBe(0);
		expect(parseModuleOverrides("").size).toBe(0);
		expect(parseModuleOverrides("{oops").size).toBe(0);
		expect(parseModuleOverrides("[1,2]").size).toBe(0);
		expect(parseModuleOverrides("null").size).toBe(0);
	});

	it("drops entries whose value is not a boolean", () => {
		const parsed = parseModuleOverrides('{"a":true,"b":"yes","c":1}');
		expect([...parsed]).toEqual([["a", true]]);
	});
});

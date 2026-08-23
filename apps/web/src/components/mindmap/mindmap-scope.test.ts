import { describe, expect, it } from "vitest";

import type { MindmapNodeRef } from "./mindmap-node-id.ts";
import {
	createMindmapScope,
	escapesMindmapScope,
	isMindmapScopeRoot,
	isScopedMindmap,
	type MindmapScope,
} from "./mindmap-scope.ts";

const PROJECT_ID = "project-1";
const MODULE_ID = "module-1";

const FULL: MindmapScope = createMindmapScope(PROJECT_ID, undefined);
const SCOPED: MindmapScope = createMindmapScope(PROJECT_ID, MODULE_ID);

describe("createMindmapScope", () => {
	it("keeps the project id and treats a missing module as the whole project", () => {
		expect(FULL).toEqual({ moduleId: undefined, projectId: PROJECT_ID });
		expect(isScopedMindmap(FULL)).toBe(false);
	});

	it("marks a module scope", () => {
		expect(SCOPED).toEqual({ moduleId: MODULE_ID, projectId: PROJECT_ID });
		expect(isScopedMindmap(SCOPED)).toBe(true);
	});
});

describe("escapesMindmapScope", () => {
	it("refuses the project root as a parent in a scoped view", () => {
		// 项目根 = parentId null = 项目级模块，不在当前子树里。
		expect(escapesMindmapScope(SCOPED, "project")).toBe(true);
	});

	it("allows module parents in a scoped view", () => {
		expect(escapesMindmapScope(SCOPED, "module")).toBe(false);
	});

	it("allows the project root in the full view", () => {
		expect(escapesMindmapScope(FULL, "project")).toBe(false);
		expect(escapesMindmapScope(FULL, "module")).toBe(false);
	});
});

describe("isMindmapScopeRoot", () => {
	const scopeRootRef: MindmapNodeRef = { id: MODULE_ID, kind: "module" };
	const otherModuleRef: MindmapNodeRef = { id: "module-2", kind: "module" };
	const caseRef: MindmapNodeRef = { id: MODULE_ID, kind: "case" };

	it("matches only the module the canvas is scoped to", () => {
		expect(isMindmapScopeRoot(SCOPED, scopeRootRef)).toBe(true);
		expect(isMindmapScopeRoot(SCOPED, otherModuleRef)).toBe(false);
	});

	it("never matches a case sharing the id", () => {
		expect(isMindmapScopeRoot(SCOPED, caseRef)).toBe(false);
	});

	it("never matches in the full view", () => {
		expect(isMindmapScopeRoot(FULL, scopeRootRef)).toBe(false);
	});
});

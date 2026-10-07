import type { NodeObj, Topic } from "mind-elixir";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
	createMindmapGuards,
	type MindmapGuardHost,
} from "./mindmap-guards.ts";
import {
	encodeCaseNodeId,
	encodeModuleNodeId,
	encodeProjectNodeId,
} from "./mindmap-node-id.ts";
import {
	createMindmapScope,
	MINDMAP_SCOPE_ESCAPE_MESSAGE,
	MINDMAP_SCOPE_ROOT_REMOVE_MESSAGE,
} from "./mindmap-scope.ts";

const PROJECT_ID = "project-1";
const SCOPE_MODULE_ID = "module-1";
const CHILD_MODULE_ID = "module-2";
const CASE_ID = "case-1";

const nodeOf = (id: string): NodeObj => ({ id, topic: "节点" });

const topicOf = (node: NodeObj): Topic =>
	({ nodeObj: node }) as unknown as Topic;

const projectRoot = () => nodeOf(encodeProjectNodeId(PROJECT_ID));

function scopeRoot(): NodeObj {
	const node = nodeOf(encodeModuleNodeId(SCOPE_MODULE_ID));
	node.parent = projectRoot();
	return node;
}

function insideNode(): NodeObj {
	const node = nodeOf(encodeModuleNodeId(CHILD_MODULE_ID));
	node.parent = scopeRoot();
	return node;
}

function createScopedHost(): MindmapGuardHost {
	return {
		confirmRemoval: vi.fn(() => Promise.resolve(true)),
		getInstance: () => null,
		openCase: vi.fn(),
		reject: vi.fn(),
		scope: createMindmapScope(PROJECT_ID, SCOPE_MODULE_ID),
		setPendingKind: vi.fn(),
	};
}

describe("a module-scoped canvas refuses edits that leave the scope", () => {
	let host: MindmapGuardHost;
	let before: ReturnType<typeof createMindmapGuards>;

	beforeEach(() => {
		host = createScopedHost();
		before = createMindmapGuards(host);
	});

	it("refuses addChild on the project root", () => {
		expect(before.addChild?.(topicOf(projectRoot()))).toBe(false);
		expect(host.reject).toHaveBeenCalledWith(MINDMAP_SCOPE_ESCAPE_MESSAGE);
		expect(host.setPendingKind).not.toHaveBeenCalled();
	});

	it("refuses a sibling of the scope root", () => {
		expect(before.insertSibling?.("after", topicOf(scopeRoot()))).toBe(false);
		expect(host.reject).toHaveBeenCalledWith(MINDMAP_SCOPE_ESCAPE_MESSAGE);
		expect(host.setPendingKind).not.toHaveBeenCalled();
	});

	it("refuses dragging a node out onto the project root", () => {
		const moved = topicOf(insideNode());
		expect(before.moveNodeIn?.([moved], topicOf(projectRoot()))).toBe(false);
		expect(host.reject).toHaveBeenCalledWith(MINDMAP_SCOPE_ESCAPE_MESSAGE);
	});

	it("refuses dragging the scope root itself", () => {
		expect(
			before.moveNodeIn?.([topicOf(scopeRoot())], topicOf(projectRoot()))
		).toBe(false);
		expect(host.reject).toHaveBeenCalledWith(MINDMAP_SCOPE_ESCAPE_MESSAGE);
	});

	it("refuses deleting the scope root", async () => {
		await expect(before.removeNodes?.([topicOf(scopeRoot())])).resolves.toBe(
			false
		);
		expect(host.reject).toHaveBeenCalledWith(MINDMAP_SCOPE_ROOT_REMOVE_MESSAGE);
		expect(host.confirmRemoval).not.toHaveBeenCalled();
	});
});

describe("a module-scoped canvas still allows everything inside the scope", () => {
	let host: MindmapGuardHost;
	let before: ReturnType<typeof createMindmapGuards>;

	beforeEach(() => {
		host = createScopedHost();
		before = createMindmapGuards(host);
	});

	it("adds children and siblings under an in-scope module", () => {
		const inside = topicOf(insideNode());
		expect(before.addChild?.(inside)).toBe(true);
		expect(before.insertSibling?.("after", inside)).toBe(true);
		expect(host.reject).not.toHaveBeenCalled();
	});

	it("moves a case into an in-scope module", () => {
		const moved = topicOf(nodeOf(encodeCaseNodeId(CASE_ID)));
		expect(before.moveNodeIn?.([moved], topicOf(insideNode()))).toBe(true);
		expect(host.reject).not.toHaveBeenCalled();
	});

	it("deletes the scope root's own children", async () => {
		await expect(before.removeNodes?.([topicOf(insideNode())])).resolves.toBe(
			true
		);
		expect(host.confirmRemoval).toHaveBeenCalled();
	});
});

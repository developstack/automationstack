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

let host = createScopedHost();
let before = createMindmapGuards(host);

beforeEach(() => {
	host = createScopedHost();
	before = createMindmapGuards(host);
});

describe("a module-scoped canvas refuses edits that leave the scope", () => {
	it.each([
		[
			"refuses addChild on the project root",
			() => before.addChild?.(topicOf(projectRoot())),
		],
		[
			"refuses a sibling of the scope root",
			() => before.insertSibling?.("after", topicOf(scopeRoot())),
		],
		[
			"refuses dragging a node out onto the project root",
			() =>
				before.moveNodeIn?.([topicOf(insideNode())], topicOf(projectRoot())),
		],
		[
			"refuses dragging the scope root itself",
			() => before.moveNodeIn?.([topicOf(scopeRoot())], topicOf(projectRoot())),
		],
	])("%s", (_name, edit) => {
		expect(edit()).toBe(false);
		expect(host.reject).toHaveBeenCalledWith(MINDMAP_SCOPE_ESCAPE_MESSAGE);
		expect(host.setPendingKind).not.toHaveBeenCalled();
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

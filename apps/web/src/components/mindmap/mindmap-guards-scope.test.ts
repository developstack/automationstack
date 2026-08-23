/**
 * 作用域（按模块）画布上的 `before` 守卫。
 *
 * 作用域视图的形状是「项目根 → 该模块子树」，而项目根是前端 adapter 自己造的
 * 假节点（mindmap-adapter.ts 的 encodeProjectNodeId）。任何以它为父级的新位置
 * 都会被 mindmap-operation-map.ts 映射成 `parentId: null`，也就是一个项目级
 * 模块 —— 它不属于当前作用域，落库后立刻从画布上消失，看起来像操作失败了；
 * 拖出去的模块还会被挂错父级（真正的父级不在这批数据里）。
 */
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

/** `before` hooks receive `Topic` DOM elements; only `nodeObj` is read. */
const topicOf = (node: NodeObj): Topic =>
	({ nodeObj: node }) as unknown as Topic;

const projectRoot = () => nodeOf(encodeProjectNodeId(PROJECT_ID));

/** 作用域根模块：画布上它挂在那个假的项目根下面。 */
function scopeRoot(): NodeObj {
	const node = nodeOf(encodeModuleNodeId(SCOPE_MODULE_ID));
	node.parent = projectRoot();
	return node;
}

/** 作用域内部的普通模块，用来验证「圈内什么都还能做」。 */
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

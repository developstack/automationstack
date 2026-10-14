import type { NodeObj, Topic } from "mind-elixir";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
	createMindmapGuards,
	type MindmapGuardHost,
	STEP_READONLY_MESSAGE,
} from "./mindmap-guards.ts";
import {
	encodeCaseNodeId,
	encodeExpectedNodeId,
	encodeModuleNodeId,
	encodeProjectNodeId,
	encodeStepNodeId,
} from "./mindmap-node-id.ts";
import { createMindmapScope, type MindmapScope } from "./mindmap-scope.ts";

const PROJECT_ID = "project-1";
const MODULE_ID = "module-1";
const CASE_ID = "case-1";
const STEP_ID = "s1";

const STEP_NODE_ID = encodeStepNodeId(CASE_ID, STEP_ID);
const EXPECTED_NODE_ID = encodeExpectedNodeId(CASE_ID, STEP_ID);

const FULL_SCOPE = createMindmapScope(PROJECT_ID, undefined);

function nodeOf(id: string, topic = "节点"): NodeObj {
	return { id, topic };
}

function topicOf(node: NodeObj): Topic {
	return { nodeObj: node } as unknown as Topic;
}

function createHost(scope: MindmapScope = FULL_SCOPE) {
	const host: MindmapGuardHost = {
		confirmRemoval: vi.fn(() => Promise.resolve(true)),
		getInstance: () => null,
		openCase: vi.fn(),
		reject: vi.fn(),
		scope,
		setPendingKind: vi.fn(),
	};
	return host;
}

let host = createHost();
let before = createMindmapGuards(host);

beforeEach(() => {
	host = createHost();
	before = createMindmapGuards(host);
});

describe("step and expected nodes are read-only on the canvas", () => {
	const stepLikeIds = [STEP_NODE_ID, EXPECTED_NODE_ID];

	it.each(stepLikeIds)("refuses beginEdit on %s", (id) => {
		expect(before.beginEdit?.(topicOf(nodeOf(id)))).toBe(false);
		expect(host.reject).toHaveBeenCalledWith(STEP_READONLY_MESSAGE);
		expect(host.openCase).not.toHaveBeenCalled();
	});

	it.each(stepLikeIds)("refuses addChild on %s", (id) => {
		expect(before.addChild?.(topicOf(nodeOf(id)))).toBe(false);
		expect(host.reject).toHaveBeenCalledWith(STEP_READONLY_MESSAGE);
		expect(host.setPendingKind).not.toHaveBeenCalled();
	});

	it.each(stepLikeIds)("refuses insertSibling on %s", (id) => {
		expect(before.insertSibling?.("after", topicOf(nodeOf(id)))).toBe(false);
		expect(host.reject).toHaveBeenCalledWith(STEP_READONLY_MESSAGE);
		expect(host.setPendingKind).not.toHaveBeenCalled();
	});

	it.each(stepLikeIds)("refuses removeNodes on %s", async (id) => {
		await expect(before.removeNodes?.([topicOf(nodeOf(id))])).resolves.toBe(
			false
		);
		expect(host.reject).toHaveBeenCalledWith(STEP_READONLY_MESSAGE);
		expect(host.confirmRemoval).not.toHaveBeenCalled();
	});

	it("refuses removeNodes when a step hides in a mixed selection", async () => {
		const selection = [
			topicOf(nodeOf(encodeCaseNodeId(CASE_ID))),
			topicOf(nodeOf(STEP_NODE_ID)),
		];
		await expect(before.removeNodes?.(selection)).resolves.toBe(false);
		expect(host.reject).toHaveBeenCalledWith(STEP_READONLY_MESSAGE);
		expect(host.confirmRemoval).not.toHaveBeenCalled();
	});
});

describe("step nodes as the dragged node or the drop target", () => {
	const moduleTopic = () => topicOf(nodeOf(encodeModuleNodeId(MODULE_ID)));
	const caseTopic = () => topicOf(nodeOf(encodeCaseNodeId(CASE_ID)));
	const childOf = (id: string, parentId: string) => {
		const node = nodeOf(id);
		node.parent = nodeOf(parentId);
		return topicOf(node);
	};

	it.each([
		[
			"refuses moveNodeIn of a step node",
			() => before.moveNodeIn?.([topicOf(nodeOf(STEP_NODE_ID))], moduleTopic()),
		],
		[
			"refuses moveNodeBefore of an expected node",
			() =>
				before.moveNodeBefore?.(
					[topicOf(nodeOf(EXPECTED_NODE_ID))],
					childOf(encodeCaseNodeId(CASE_ID), encodeModuleNodeId(MODULE_ID))
				),
		],
		[
			"refuses dropping a module into a step node",
			() => before.moveNodeIn?.([moduleTopic()], topicOf(nodeOf(STEP_NODE_ID))),
		],
		[
			"refuses dropping a case into an expected node",
			() =>
				before.moveNodeIn?.([caseTopic()], topicOf(nodeOf(EXPECTED_NODE_ID))),
		],
		[
			"refuses a sibling drop whose parent is a step node",
			() =>
				before.moveNodeAfter?.(
					[moduleTopic()],
					childOf(EXPECTED_NODE_ID, STEP_NODE_ID)
				),
		],
	])("%s", (_name, move) => {
		expect(move()).toBe(false);
		expect(host.reject).toHaveBeenCalledWith(STEP_READONLY_MESSAGE);
	});
});

describe("existing module / case behaviour is unchanged", () => {
	it("still allows adding a child module under a module", () => {
		expect(
			before.addChild?.(topicOf(nodeOf(encodeModuleNodeId(MODULE_ID))))
		).toBe(true);
		expect(host.setPendingKind).toHaveBeenCalledWith("module");
	});

	it("still refuses children under a case with the case message", () => {
		expect(before.addChild?.(topicOf(nodeOf(encodeCaseNodeId(CASE_ID))))).toBe(
			false
		);
		expect(host.reject).toHaveBeenCalledWith("用例节点不能包含子节点");
	});

	it("still opens the case detail on double-click", () => {
		expect(before.beginEdit?.(topicOf(nodeOf(encodeCaseNodeId(CASE_ID))))).toBe(
			false
		);
		expect(host.openCase).toHaveBeenCalledWith(CASE_ID);
	});

	it("still refuses editing the project root", () => {
		expect(
			before.insertSibling?.(
				"after",
				topicOf(nodeOf(encodeProjectNodeId(PROJECT_ID)))
			)
		).toBe(false);
		expect(host.reject).toHaveBeenCalledWith("项目根节点不支持该操作");
	});

	it("still moves a case into a module", () => {
		const moved = topicOf(nodeOf(encodeCaseNodeId(CASE_ID)));
		const target = topicOf(nodeOf(encodeModuleNodeId(MODULE_ID)));
		expect(before.moveNodeIn?.([moved], target)).toBe(true);
		expect(host.reject).not.toHaveBeenCalled();
	});

	it("still creates a project-level module on the root in the full view", () => {
		expect(
			before.addChild?.(topicOf(nodeOf(encodeProjectNodeId(PROJECT_ID))))
		).toBe(true);
		expect(host.setPendingKind).toHaveBeenCalledWith("module");
	});
});

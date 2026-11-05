import MindElixir, { type MindElixirInstance } from "mind-elixir";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stubMatchMedia } from "@/test-dom-fixtures";
import { toMindElixirData } from "./mindmap-adapter.ts";
import { buildMindmapContextMenu } from "./mindmap-context-menu.ts";
import { MINDMAP_MENU_ITEM as ITEM } from "./mindmap-menu-items.ts";
import {
	encodeCaseNodeId,
	encodeModuleNodeId,
	encodeProjectNodeId,
	encodeStepNodeId,
} from "./mindmap-node-id.ts";

import { createMindmapScope, type MindmapScope } from "./mindmap-scope.ts";

const PROJECT_ID = "project-1";
const MODULE_ID = "m1";
const CASE_ID = "c1";
const STEP = { expected: "", id: "s1", step: "打开页面" };

let cleanup: (() => void) | null = null;

// jsdom 没有 matchMedia，mind-elixir 创建实例时要用它判断深色模式
beforeEach(() => {
	stubMatchMedia();
});

afterEach(() => {
	cleanup?.();
	cleanup = null;
	vi.unstubAllGlobals();
});

/** 项目根下一个模块，模块下一条有一个步骤的用例；用例和步骤展开 */
function mountMindmap(scope: MindmapScope) {
	const el = document.createElement("div");
	document.body.append(el);
	let instance: MindElixirInstance | null = null;
	const menu = buildMindmapContextMenu({
		getInstance: () => instance,
		reject: vi.fn(),
		scope,
	});
	const mind = new MindElixir({ contextMenu: menu.option, el });
	instance = mind;
	const detach = menu.bind(mind);
	const data = toMindElixirData({
		cases: [
			{
				id: CASE_ID,
				moduleId: MODULE_ID,
				name: "用例",
				priority: "P2",
				sortOrder: 0,
				status: "draft",
				steps: [STEP],
			},
		],
		modules: [{ children: [], id: MODULE_ID, name: "模块", sortOrder: 0 }],
		projectId: PROJECT_ID,
		projectName: "项目",
	});
	mind.init(data);
	cleanup = () => {
		detach();
		mind.destroy();
		el.remove();
	};
	return mind;
}

/** 与 mind-elixir 右键时的顺序相同：先选中节点，再发出 showContextMenu */
async function openMenu(mind: MindElixirInstance, nodeId: string) {
	mind.expandNode(mind.findEle(encodeModuleNodeId(MODULE_ID)), true);
	mind.expandNode(mind.findEle(encodeCaseNodeId(CASE_ID)), true);
	const topic = mind.findEle(nodeId);
	mind.selectNode(topic);
	// 事件不冒泡，不触发 mind-elixir 自己延迟 200ms 的右键处理；在节点上派发，事件才有 target
	topic.addEventListener(
		"contextmenu",
		(event) => mind.bus.fire("showContextMenu", event),
		{ once: true }
	);
	topic.dispatchEvent(new MouseEvent("contextmenu"));
	await Promise.resolve();
	const container = mind.container.querySelector(".context-menu");
	const shown = [
		...mind.container.querySelectorAll<HTMLLIElement>(".menu-list > li"),
	].filter((li) => !li.hidden);
	return {
		items: shown.map((li) => li.id),
		open: container instanceof HTMLElement && !container.hidden,
	};
}

describe("buildMindmapContextMenu：打开菜单时只显示当前节点能用的项", () => {
	const fullScope = createMindmapScope(PROJECT_ID, undefined);

	it("用例节点只显示用例能用的项，不显示新建用例和插入子节点", async () => {
		const mind = mountMindmap(fullScope);
		const menu = await openMenu(mind, encodeCaseNodeId(CASE_ID));
		expect(menu).toEqual({
			items: [ITEM.addSibling, ITEM.remove, ITEM.focus, ITEM.rename],
			open: true,
		});
	});

	it("换一个节点再打开时重新计算", async () => {
		const mind = mountMindmap(fullScope);
		await openMenu(mind, encodeStepNodeId(CASE_ID, STEP.id));
		const menu = await openMenu(mind, encodeProjectNodeId(PROJECT_ID));
		expect(menu).toEqual({ items: [ITEM.addChild], open: true });
	});

	it("一项都不能用时不打开菜单", async () => {
		const scope = createMindmapScope(PROJECT_ID, MODULE_ID);
		const mind = mountMindmap(scope);
		const menu = await openMenu(mind, encodeProjectNodeId(PROJECT_ID));
		expect(menu).toEqual({ items: [], open: false });
	});

	it.each([
		[ITEM.createCase, "addChild"],
		[ITEM.rename, "editTopic"],
	] as const)("点击%s后关闭菜单并执行 %s", async (item, method) => {
		const mind = mountMindmap(fullScope);
		const run = vi.spyOn(mind, method).mockResolvedValue(undefined);
		await openMenu(mind, encodeModuleNodeId(MODULE_ID));
		document.getElementById(item)?.click();
		expect(run).toHaveBeenCalled();
		expect(
			mind.container.querySelector<HTMLElement>(".context-menu")?.hidden
		).toBe(true);
	});
});

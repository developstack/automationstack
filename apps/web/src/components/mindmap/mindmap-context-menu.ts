import type { MindElixirInstance, Options } from "mind-elixir";

import {
	listMindmapMenuItems,
	MINDMAP_MENU_ITEM,
	type MindmapMenuItemId,
} from "./mindmap-menu-items.ts";
import { buildNewCaseNode, findTopic } from "./mindmap-node-utils.ts";
import type { MindmapScope } from "./mindmap-scope.ts";

type ContextMenuOption = Exclude<Options["contextMenu"], boolean | undefined>;

export interface MindmapMenuHost {
	getInstance: () => MindElixirInstance | null;
	reject: (message: string) => void;
	scope: MindmapScope;
}

export interface MindmapContextMenu {
	/** 在 mind.init 之前调用，返回解除绑定的函数 */
	bind: (mind: MindElixirInstance) => () => void;
	option: ContextMenuOption;
}

const MENU_SELECTOR = ".context-menu";
const MENU_ITEM_SELECTOR = ".context-menu .menu-list > li";
const CREATE_FAILED_MESSAGE = "新建用例失败";

function listCurrentItems(
	mind: MindElixirInstance,
	scope: MindmapScope
): ReadonlySet<MindmapMenuItemId> {
	const node = mind.currentNode?.nodeObj;
	if (node === undefined) {
		return new Set();
	}
	return listMindmapMenuItems({
		displayRoot: mind.nodeData,
		focusMode: mind.isFocusMode,
		node,
		scope,
		selected: (mind.currentNodes ?? []).map((topic) => topic.nodeObj),
	});
}

function hideMenu(mind: MindElixirInstance): void {
	const menu = mind.container.querySelector(MENU_SELECTOR);
	if (menu instanceof HTMLElement) {
		menu.hidden = true;
	}
}

/**
 * mind-elixir 的菜单项是固定的。每次打开时按当前节点隐藏不能用的项。
 * 这个监听在 mind.init 之前注册，所以先于 mind-elixir 的监听执行，mind-elixir 按隐藏后的高度定位菜单。
 * mind-elixir 的监听总会打开菜单，所以一项都不能用时，在它之后的微任务中关闭菜单。
 */
function showUsableItems(mind: MindElixirInstance, scope: MindmapScope): void {
	const usable: ReadonlySet<string> = listCurrentItems(mind, scope);
	for (const li of mind.container.querySelectorAll(MENU_ITEM_SELECTOR)) {
		if (li instanceof HTMLElement) {
			li.hidden = !usable.has(li.id);
		}
	}
	if (usable.size === 0) {
		queueMicrotask(() => hideMenu(mind));
	}
}

async function createCaseNode(mind: MindElixirInstance): Promise<void> {
	const target = mind.currentNode;
	if (target === null) {
		return;
	}
	const node = buildNewCaseNode();
	await mind.addChild(target, node);
	const topic = findTopic(mind, node.id);
	if (topic !== null) {
		mind.editTopic(topic);
	}
}

function onCreateCase(host: MindmapMenuHost): void {
	const mind = host.getInstance();
	if (mind === null) {
		return;
	}
	hideMenu(mind);
	createCaseNode(mind).catch(() => host.reject(CREATE_FAILED_MESSAGE));
}

function onRename(host: MindmapMenuHost): void {
	const mind = host.getInstance();
	const target = mind?.currentNode ?? null;
	if (mind === null || target === null) {
		return;
	}
	hideMenu(mind);
	mind.editTopic(target);
}

export function buildMindmapContextMenu(
	host: MindmapMenuHost
): MindmapContextMenu {
	return {
		bind: (mind) => {
			const listener = () => showUsableItems(mind, host.scope);
			mind.bus.addListener("showContextMenu", listener);
			return () => mind.bus.removeListener("showContextMenu", listener);
		},
		option: {
			extend: [
				{
					name: MINDMAP_MENU_ITEM.createCase,
					onclick: () => onCreateCase(host),
				},
				{ name: MINDMAP_MENU_ITEM.rename, onclick: () => onRename(host) },
			],
			link: false,
		},
	};
}

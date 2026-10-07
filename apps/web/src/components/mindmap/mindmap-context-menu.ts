import type { MindElixirInstance, Options } from "mind-elixir";

import { getEntityNodeRef, getMindmapNodeRef } from "./mindmap-adapter.ts";
import { STEP_READONLY_MESSAGE } from "./mindmap-guards.ts";
import { isStepNodeRef } from "./mindmap-node-id.ts";
import { buildNewCaseNode, findTopic } from "./mindmap-node-utils.ts";

type ContextMenuOption = Exclude<Options["contextMenu"], boolean | undefined>;

export interface MindmapMenuHost {
	getInstance: () => MindElixirInstance | null;
	reject: (message: string) => void;
}

const UNSUPPORTED_ITEM_IDS = ["cm-add_parent", "cm-summary"] as const;

const CREATE_CASE_LABEL = "新建用例";
const RENAME_LABEL = "重命名";
const MODULE_ONLY_MESSAGE = "只能在模块下新建用例";
const CREATE_FAILED_MESSAGE = "新建用例失败";

function hideMenu(mind: MindElixirInstance): void {
	const menu = mind.container.querySelector(".context-menu");
	if (menu instanceof HTMLElement) {
		menu.hidden = true;
	}
}

async function createCaseNode(
	mind: MindElixirInstance,
	host: MindmapMenuHost
): Promise<void> {
	const target = mind.currentNode;
	if (target === null) {
		return;
	}
	if (getMindmapNodeRef(target.nodeObj)?.kind !== "module") {
		host.reject(MODULE_ONLY_MESSAGE);
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
	createCaseNode(mind, host).catch(() => host.reject(CREATE_FAILED_MESSAGE));
}

function onRename(host: MindmapMenuHost): void {
	const mind = host.getInstance();
	const target = mind?.currentNode ?? null;
	if (mind === null || target === null) {
		return;
	}
	hideMenu(mind);
	const ref = getMindmapNodeRef(target.nodeObj);
	if (ref !== null && isStepNodeRef(ref)) {
		host.reject(STEP_READONLY_MESSAGE);
		return;
	}
	if (getEntityNodeRef(target.nodeObj) !== null) {
		mind.editTopic(target);
	}
}

export function pruneMindmapContextMenu(mind: MindElixirInstance): void {
	for (const id of UNSUPPORTED_ITEM_IDS) {
		mind.container.querySelector(`#${id}`)?.remove();
	}
}

export function buildMindmapContextMenu(
	host: MindmapMenuHost
): ContextMenuOption {
	return {
		extend: [
			{ name: CREATE_CASE_LABEL, onclick: () => onCreateCase(host) },
			{ name: RENAME_LABEL, onclick: () => onRename(host) },
		],
		link: false,
	};
}

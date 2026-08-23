/**
 * Context-menu wiring for the mindmap canvas.
 *
 * mind-elixir@5.15.1 builds the menu once from `Options.contextMenu` and only
 * supports appending items through `extend` (`{ name, key?, onclick }`); the
 * extended items get `id = name` and — unlike the built-in entries — do *not*
 * close the menu, so every handler hides it explicitly. Built-in entries that
 * have no `mindmap.batch` counterpart are removed from the DOM after init,
 * because the plugin offers no way to omit them up front.
 */
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

/** Built-ins without a server-side counterpart (insert parent / summary). */
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
		// `editTopic` bypasses the `before` hooks, so the fresh case can be named
		// right away even though `beginEdit` is vetoed for case nodes.
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
	// `editTopic` bypasses `before`, so step / expected nodes must be refused
	// here too — otherwise the one path around the guards would reopen them.
	const ref = getMindmapNodeRef(target.nodeObj);
	if (ref !== null && isStepNodeRef(ref)) {
		host.reject(STEP_READONLY_MESSAGE);
		return;
	}
	if (getEntityNodeRef(target.nodeObj) !== null) {
		mind.editTopic(target);
	}
}

/** Removes the built-in entries this canvas cannot mirror to the server. */
export function pruneMindmapContextMenu(mind: MindElixirInstance): void {
	for (const id of UNSUPPORTED_ITEM_IDS) {
		mind.container.querySelector(`#${id}`)?.remove();
	}
}

/** Context-menu options for `new MindElixir({ contextMenu })`. */
export function buildMindmapContextMenu(
	host: MindmapMenuHost
): ContextMenuOption {
	return {
		extend: [
			{ name: CREATE_CASE_LABEL, onclick: () => onCreateCase(host) },
			// F2 is not advertised here: it routes through `beginEdit`, which case
			// nodes veto in favour of opening the case detail.
			{ name: RENAME_LABEL, onclick: () => onRename(host) },
		],
		// Arrows/bidirectional links are not part of the platform model.
		link: false,
	};
}

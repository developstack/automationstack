import { describe, expect, it } from "vitest";

import {
	type MindmapKeyEvent,
	shouldBlockMindmapKey,
} from "./mindmap-key-guard.ts";

type KeyPatch = Partial<MindmapKeyEvent>;

function keyEvent(patch: KeyPatch): MindmapKeyEvent {
	return {
		altKey: false,
		ctrlKey: false,
		key: "ArrowRight",
		metaKey: false,
		shiftKey: false,
		...patch,
	};
}

/** 每个键各按一次 Cmd 和 Ctrl。 */
function withCmdOrCtrl(keys: string[], extra: KeyPatch = {}): KeyPatch[] {
	return keys.flatMap((key) => [
		{ ...extra, key, metaKey: true },
		{ ...extra, ctrlKey: true, key },
	]);
}

const ARROWS = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"];
const EDIT_KEYS = ["Tab", "Enter", "Delete", "Backspace", "F1", "F2"];

const CASES: [string, KeyPatch[], boolean][] = [
	[
		"拦下三个会改 direction 的组合（Cmd 与 Ctrl 两侧都拦）",
		withCmdOrCtrl(["ArrowLeft", "ArrowRight", "ArrowUp"]),
		true,
	],
	[
		"拦下 Cmd/Ctrl + K：它会开 2 秒的折叠模式，随后的 0/=/1-9 会 refresh 整棵树",
		withCmdOrCtrl(["k"]),
		true,
	],
	[
		"不拦不带修饰键的方向键：那是节点导航，必须保留",
		ARROWS.flatMap((key) => [
			{ key },
			{ key, shiftKey: true },
			{ altKey: true, key },
		]),
		false,
	],
	[
		"不拦 Cmd/Ctrl + ↓：库的 ArrowDown 分支里没有方向布局这条路",
		withCmdOrCtrl(["ArrowDown"]),
		false,
	],
	[
		"不拦 Cmd/Ctrl + Alt + ↑：alt 优先，那条路是 moveUpNode 不是 initSide",
		[{ altKey: true, key: "ArrowUp", metaKey: true }],
		false,
	],
	[
		"照拦 Cmd/Ctrl + Alt + ←/→：那两个分支根本没读 altKey，仍会改 direction",
		withCmdOrCtrl(["ArrowLeft", "ArrowRight"], { altKey: true }),
		true,
	],
	[
		"Shift 不影响方向键的判定：库的分支同样没读 shiftKey",
		[{ key: "ArrowLeft", metaKey: true, shiftKey: true }],
		true,
	],
	[
		"不拦大写 K：Shift 一按 event.key 就变了，库的键位表查不到",
		[{ key: "K", metaKey: true }],
		false,
	],
	[
		"不拦其它键，包括 mind-elixir 自己要用的编辑键",
		[
			...EDIT_KEYS.flatMap((key) => [{ key }, { key, metaKey: true }]),
			...["c", "v", "x", "=", "-", "0"].map((key) => ({ key, metaKey: true })),
		],
		false,
	],
];

describe("shouldBlockMindmapKey", () => {
	it.each(CASES)("%s", (_name, patches, blocked) => {
		for (const patch of patches) {
			expect(shouldBlockMindmapKey(keyEvent(patch)), patch.key).toBe(blocked);
		}
	});
});

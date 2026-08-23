import { describe, expect, it } from "vitest";

import {
	type MindmapKeyEvent,
	shouldBlockMindmapKey,
} from "./mindmap-key-guard.ts";

/**
 * 这个谓词是画布唯一的「不许改 direction」防线，而它到底该拦哪几下，完全取决于
 * mind-elixir 键位表里那几个分支的写法（尤其是 ArrowUp 的 alt 优先、以及
 * ArrowLeft/ArrowRight 压根不读 alt 这两处不对称）。升级库时这些分支一改，
 * 下面的断言就该跟着响。DOM 绑定不测：本仓库的 vitest 跑在 node 环境
 * （见根 vitest.config.ts），谓词因此被设计成不碰 DOM，事件只用普通对象喂。
 */

function keyEvent(patch: Partial<MindmapKeyEvent> = {}): MindmapKeyEvent {
	return {
		altKey: false,
		ctrlKey: false,
		key: "ArrowRight",
		metaKey: false,
		shiftKey: false,
		...patch,
	};
}

describe("shouldBlockMindmapKey", () => {
	it("拦下三个会改 direction 的组合（Cmd 与 Ctrl 两侧都拦）", () => {
		for (const key of ["ArrowLeft", "ArrowRight", "ArrowUp"]) {
			expect(shouldBlockMindmapKey(keyEvent({ key, metaKey: true }))).toBe(
				true
			);
			expect(shouldBlockMindmapKey(keyEvent({ ctrlKey: true, key }))).toBe(
				true
			);
		}
	});

	it("拦下 Cmd/Ctrl + K：它会开 2 秒的折叠模式，随后的 0/=/1-9 会 refresh 整棵树", () => {
		expect(shouldBlockMindmapKey(keyEvent({ key: "k", metaKey: true }))).toBe(
			true
		);
		expect(shouldBlockMindmapKey(keyEvent({ ctrlKey: true, key: "k" }))).toBe(
			true
		);
	});

	it("不拦不带修饰键的方向键：那是节点导航，必须保留", () => {
		for (const key of ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"]) {
			expect(shouldBlockMindmapKey(keyEvent({ key }))).toBe(false);
			// 只按 Shift / Alt 也不算修饰键命中。
			expect(shouldBlockMindmapKey(keyEvent({ key, shiftKey: true }))).toBe(
				false
			);
			expect(shouldBlockMindmapKey(keyEvent({ altKey: true, key }))).toBe(
				false
			);
		}
	});

	it("不拦 Cmd/Ctrl + ↓：库的 ArrowDown 分支里没有方向布局这条路", () => {
		expect(
			shouldBlockMindmapKey(keyEvent({ key: "ArrowDown", metaKey: true }))
		).toBe(false);
		expect(
			shouldBlockMindmapKey(keyEvent({ ctrlKey: true, key: "ArrowDown" }))
		).toBe(false);
	});

	it("不拦 Cmd/Ctrl + Alt + ↑：alt 优先，那条路是 moveUpNode 不是 initSide", () => {
		expect(
			shouldBlockMindmapKey(
				keyEvent({ altKey: true, key: "ArrowUp", metaKey: true })
			)
		).toBe(false);
	});

	it("照拦 Cmd/Ctrl + Alt + ←/→：那两个分支根本没读 altKey，仍会改 direction", () => {
		for (const key of ["ArrowLeft", "ArrowRight"]) {
			expect(
				shouldBlockMindmapKey(keyEvent({ altKey: true, key, metaKey: true }))
			).toBe(true);
		}
	});

	it("Shift 不影响方向键的判定：库的分支同样没读 shiftKey", () => {
		expect(
			shouldBlockMindmapKey(
				keyEvent({ key: "ArrowLeft", metaKey: true, shiftKey: true })
			)
		).toBe(true);
	});

	it("不拦大写 K：Shift 一按 event.key 就变了，库的键位表查不到", () => {
		expect(shouldBlockMindmapKey(keyEvent({ key: "K", metaKey: true }))).toBe(
			false
		);
	});

	it("不拦其它键，包括 mind-elixir 自己要用的编辑键", () => {
		for (const key of ["Tab", "Enter", "Delete", "Backspace", "F1", "F2"]) {
			expect(shouldBlockMindmapKey(keyEvent({ key, metaKey: true }))).toBe(
				false
			);
			expect(shouldBlockMindmapKey(keyEvent({ key }))).toBe(false);
		}
		// 复制粘贴与缩放同样不归这里管。
		for (const key of ["c", "v", "x", "=", "-", "0"]) {
			expect(shouldBlockMindmapKey(keyEvent({ key, metaKey: true }))).toBe(
				false
			);
		}
	});
});

import { describe, expect, it } from "vitest";

import {
	contextMenuPointFromRect,
	isContextMenuKey,
} from "@/components/workspace/module-row-context-key";

describe("isContextMenuKey", () => {
	it.each([
		["认 Windows / Linux 的应用程序键", "ContextMenu", false, true],
		["认 Shift+F10（macOS 上唯一还能按出来的组合）", "F10", true, true],
		["不认没按 Shift 的 F10：那是浏览器/系统自己的快捷键", "F10", false, false],
		["不认普通按键，行内的输入与导航不受影响", "Enter", false, false],
		["不认普通按键，行内的输入与导航不受影响", "F", true, false],
	])("%s（%s）", (_name, key, shiftKey, matches) => {
		expect(isContextMenuKey({ key, shiftKey })).toBe(matches);
	});
});

describe("contextMenuPointFromRect", () => {
	it("锚在行下沿的行内容起始处，不是视口角上的 (0,0)", () => {
		expect(contextMenuPointFromRect({ bottom: 140, left: 32 })).toEqual({
			x: 40,
			y: 140,
		});
	});

	it("坐标跟着行走：不同的行给出不同的锚点", () => {
		const first = contextMenuPointFromRect({ bottom: 140, left: 32 });
		const second = contextMenuPointFromRect({ bottom: 168, left: 32 });
		expect(second.y).toBeGreaterThan(first.y);
		expect(second.x).toBe(first.x);
	});
});

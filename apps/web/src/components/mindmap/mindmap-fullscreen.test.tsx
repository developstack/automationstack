import { act, fireEvent, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useMindmapFullscreen } from "./mindmap-fullscreen.ts";

describe("useMindmapFullscreen：画布铺满窗口，可以用 Esc 退出", () => {
	it("切换后进入全屏，按 Esc 退出", () => {
		const { result } = renderHook(() => useMindmapFullscreen(null));
		expect(result.current.active).toBe(false);

		act(() => result.current.toggle());
		expect(result.current.active).toBe(true);

		fireEvent.keyDown(document, { key: "Escape" });
		expect(result.current.active).toBe(false);
	});

	it("编辑节点时的 Esc（已被 mind-elixir 处理）不退出全屏", () => {
		const { result } = renderHook(() => useMindmapFullscreen(null));
		act(() => result.current.toggle());

		const event = new KeyboardEvent("keydown", {
			bubbles: true,
			cancelable: true,
			key: "Escape",
		});
		event.preventDefault();
		act(() => {
			document.dispatchEvent(event);
		});
		expect(result.current.active).toBe(true);
	});

	it("不在全屏时 Esc 不改变状态", () => {
		const { result } = renderHook(() => useMindmapFullscreen(null));
		fireEvent.keyDown(document, { key: "Escape" });
		expect(result.current.active).toBe(false);
	});
});

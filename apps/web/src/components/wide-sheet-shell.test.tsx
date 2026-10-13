import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useUnsavedCloseGuard } from "@/components/wide-sheet-shell";

describe("useUnsavedCloseGuard：有未保存的修改时，关闭面板会提醒", () => {
	it("没有修改时直接关闭", () => {
		const onClose = vi.fn();
		const { result } = renderHook(() => useUnsavedCloseGuard(false, onClose));
		act(() => result.current.handleOpenChange(false));
		expect(onClose).toHaveBeenCalledOnce();
		expect(result.current.confirming).toBe(false);
	});

	it("有修改时先提醒，选择继续编辑后面板不关闭", () => {
		const onClose = vi.fn();
		const { result } = renderHook(() => useUnsavedCloseGuard(true, onClose));
		act(() => result.current.handleOpenChange(false));
		expect(result.current.confirming).toBe(true);
		expect(onClose).not.toHaveBeenCalled();

		act(() => result.current.cancelClose());
		expect(result.current.confirming).toBe(false);
		expect(onClose).not.toHaveBeenCalled();
	});

	it("有修改时确认放弃后才关闭", () => {
		const onClose = vi.fn();
		const { result } = renderHook(() => useUnsavedCloseGuard(true, onClose));
		act(() => result.current.handleOpenChange(false));
		act(() => result.current.confirmClose());
		expect(onClose).toHaveBeenCalledOnce();
		expect(result.current.confirming).toBe(false);
	});
});

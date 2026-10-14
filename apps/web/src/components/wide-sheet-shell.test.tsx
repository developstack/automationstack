import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useUnsavedCloseGuard } from "@/components/wide-sheet-shell";

function renderGuard(dirty: boolean) {
	const onClose = vi.fn();
	const { result } = renderHook(() => useUnsavedCloseGuard(dirty, onClose));
	act(() => result.current.handleOpenChange(false));
	return { onClose, result };
}

describe("useUnsavedCloseGuard：有未保存的修改时，关闭面板会提醒", () => {
	it("没有修改时直接关闭", () => {
		const { onClose, result } = renderGuard(false);
		expect(onClose).toHaveBeenCalledOnce();
		expect(result.current.confirming).toBe(false);
	});

	it("有修改时先提醒，选择继续编辑后面板不关闭", () => {
		const { onClose, result } = renderGuard(true);
		expect(result.current.confirming).toBe(true);
		expect(onClose).not.toHaveBeenCalled();

		act(() => result.current.cancelClose());
		expect(result.current.confirming).toBe(false);
		expect(onClose).not.toHaveBeenCalled();
	});

	it("有修改时确认放弃后才关闭", () => {
		const { onClose, result } = renderGuard(true);
		act(() => result.current.confirmClose());
		expect(onClose).toHaveBeenCalledOnce();
		expect(result.current.confirming).toBe(false);
	});
});

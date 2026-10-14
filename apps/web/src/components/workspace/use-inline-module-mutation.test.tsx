import { useMutation } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { toast } from "sonner";
import { describe, expect, it, vi } from "vitest";

import { useInlineModuleMutationOptions } from "@/components/workspace/use-inline-module-mutation";
import { createQueryWrapper } from "@/test-dom-fixtures";

vi.mock("@/utils/orpc", () => ({
	orpc: { modules: { key: () => ["modules"] } },
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const TEXT = { action: "重命名模块", success: "模块已重命名" };

function renderSave(save: () => Promise<unknown>) {
	vi.mocked(toast.error).mockClear();
	return renderHook(
		() =>
			useMutation({
				...useInlineModuleMutationOptions(TEXT),
				mutationFn: save,
			}),
		{ wrapper: createQueryWrapper() }
	);
}

describe("useInlineModuleMutationOptions：就地编辑保存失败时，原因不会丢失", () => {
	it("输入框还在时，失败原因留给输入框显示，不弹出提示", async () => {
		const view = renderSave(() => Promise.reject(new Error("名称重复")));
		act(() => view.result.current.mutate());
		await waitFor(() => expect(view.result.current.isError).toBe(true));
		expect(toast.error).not.toHaveBeenCalled();
	});

	it("输入框已经消失时（用户开始编辑别处），弹出失败提示", async () => {
		// 先建好待定的保存，卸载后再让它失败。mutationFn 要等 onMutate 之后才被调用
		let fail: (error: Error) => void = () => undefined;
		const saving = new Promise((_, reject) => {
			fail = reject;
		});
		const view = renderSave(() => saving);
		act(() => view.result.current.mutate());
		view.unmount();
		fail(new Error("名称重复"));
		await waitFor(() =>
			expect(toast.error).toHaveBeenCalledWith("重命名模块失败：名称重复")
		);
	});
});

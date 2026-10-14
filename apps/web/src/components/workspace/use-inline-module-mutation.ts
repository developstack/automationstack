import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef } from "react";
import { toast } from "sonner";

import { failureMessage } from "@/utils/failure-message";
import { orpc } from "@/utils/orpc";

interface InlineModuleMutationText {
	/** 操作名，例如「重命名模块」。失败提示写成「重命名模块失败：原因」 */
	action: string;
	success: string;
}

/**
 * 模块树就地编辑（新建、重命名）共用的保存设置：
 * - 保存失败的原因显示在输入框下方，所以不弹出全局失败提示；
 * - 输入框已经消失时（例如用户已经开始编辑别处），改为弹出失败提示，原因不会丢失；
 * - 保存后等模块树刷新完再结束，所以树中不会先闪一下旧内容。
 */
export function useInlineModuleMutationOptions(text: InlineModuleMutationText) {
	const queryClient = useQueryClient();
	// 输入框存在期间有效，卸载时中止。保存失败时据此判断原因能不能显示在输入框下方
	const lifetime = useRef<AbortController | null>(null);
	useEffect(() => {
		const controller = new AbortController();
		lifetime.current = controller;
		return () => controller.abort();
	}, []);
	const { action, success } = text;
	return useMemo(
		() => ({
			meta: { suppressErrorToast: true },
			onError: (error: unknown) => {
				const inputGone = lifetime.current?.signal.aborted !== false;
				if (inputGone) {
					toast.error(failureMessage(action, error));
				}
			},
			onSuccess: async () => {
				await queryClient.invalidateQueries({ queryKey: orpc.modules.key() });
				toast.success(success);
			},
		}),
		[action, queryClient, success]
	);
}

/** 输入框下方显示的保存失败原因 */
export function inlineMutationError(mutation: {
	error: unknown;
	isError: boolean;
}): string | null {
	return mutation.isError ? failureMessage(undefined, mutation.error) : null;
}

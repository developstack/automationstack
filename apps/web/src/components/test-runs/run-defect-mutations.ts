/**
 * 缺陷面板的三条写路径（建单 / 关联 / 解除+刷新状态）与它们共用的缓存失效。
 *
 * 它们是**hook 而不是子组件**：每一组都必须继续跑在原来那个组件实例上，
 * 顺序也不许动。`useDefectLinkForm` 尤其如此——`reference` 是受控输入框的
 * state，搬进新子组件会连带换掉 input 的实例身份，打字打到一半就丢焦点。
 * 自定义 hook 不改组件树，只把这几行挪出视野。
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type ChangeEvent, type FormEvent, useCallback, useState } from "react";
import { toast } from "sonner";

import { orpc } from "@/utils/orpc";

/** 三条写路径都会改动测试任务下的用例，一律刷 testRuns 这一个缓存根。 */
export function useInvalidateRuns(): () => void {
	const queryClient = useQueryClient();
	return useCallback(() => {
		queryClient.invalidateQueries({ queryKey: orpc.testRuns.key() });
	}, [queryClient]);
}

/** 已关联时可做的两件事：解除关联、向 Jira 重新问一次状态。 */
export function useLinkedDefectActions(runCaseId: string) {
	const invalidate = useInvalidateRuns();
	const clear = useMutation(
		orpc.jira.clearDefect.mutationOptions({
			onSuccess: () => {
				invalidate();
				toast.success("已解除缺陷关联");
			},
		})
	);
	const refresh = useMutation(
		orpc.jira.refreshDefectStatus.mutationOptions({
			onSuccess: (data) => {
				invalidate();
				toast.success(
					data.status === null ? "Jira 未返回状态" : `Jira 状态：${data.status}`
				);
			},
		})
	);
	const handleClear = useCallback(
		() => clear.mutate({ runCaseId }),
		[clear, runCaseId]
	);
	const handleRefresh = useCallback(
		() => refresh.mutate({ runCaseId }),
		[refresh, runCaseId]
	);

	return { clear, handleClear, handleRefresh, refresh };
}

/** 反向关联表单的受控状态 + 提交。 */
export function useDefectLinkForm(runCaseId: string) {
	const invalidate = useInvalidateRuns();
	const [reference, setReference] = useState("");
	const link = useMutation(
		orpc.jira.linkDefect.mutationOptions({
			onSuccess: () => {
				invalidate();
				setReference("");
				toast.success("已关联缺陷");
			},
		})
	);

	const handleChange = useCallback(
		(event: ChangeEvent<HTMLInputElement>) => setReference(event.target.value),
		[]
	);
	const handleSubmit = useCallback(
		(event: FormEvent<HTMLFormElement>) => {
			event.preventDefault();
			const trimmed = reference.trim();
			if (trimmed !== "") {
				link.mutate({ reference: trimmed, runCaseId });
			}
		},
		[link, reference, runCaseId]
	);

	return { handleChange, handleSubmit, link, reference };
}

/** 已配置 Jira 时才走得通的一键建单。 */
export function useCreateDefect(runCaseId: string) {
	const invalidate = useInvalidateRuns();
	const create = useMutation(
		orpc.jira.createDefect.mutationOptions({
			onSuccess: (view) => {
				invalidate();
				toast.success(`已创建 ${view.defectKey ?? "Jira issue"}`);
			},
		})
	);
	const handleClick = useCallback(
		() => create.mutate({ runCaseId }),
		[create, runCaseId]
	);

	return { create, handleClick };
}

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type ChangeEvent, type FormEvent, useCallback, useState } from "react";
import { toast } from "sonner";

import { orpc } from "@/utils/orpc";

export function useInvalidateRuns(): () => void {
	const queryClient = useQueryClient();
	return useCallback(() => {
		queryClient.invalidateQueries({ queryKey: orpc.testRuns.key() });
	}, [queryClient]);
}

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

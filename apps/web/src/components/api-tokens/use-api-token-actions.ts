import type { ApiTokenView } from "@automationstack/db/schema/api-tokens";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { toast } from "sonner";

import { orpc } from "@/utils/orpc";

export interface ApiTokenActions {
	closeConfirm: () => void;
	/** 执行吊销。 */
	confirm: () => void;
	/** 待确认时为 true。这一页只有「吊销」一个动作，所以是布尔而不是 kind 联合。 */
	confirming: boolean;
	/** 服务端错误文案；由确认框就地显示。 */
	error: string | undefined;
	isPending: boolean;
	openConfirm: () => void;
}

/**
 * 单枚 token 的吊销动作，外加待确认状态。
 *
 * 吊销不做乐观更新：这是一次不可撤销的作废，行上的状态必须是服务端确认过的
 * 那一份。抢先把行画成「已吊销」而请求其实失败了，人会以为脚本已经断了。
 */
export function useApiTokenActions(token: ApiTokenView): ApiTokenActions {
	const queryClient = useQueryClient();
	const [confirming, setConfirming] = useState(false);

	const revoke = useMutation(
		orpc.apiTokens.revoke.mutationOptions({
			// NOT_FOUND（多半是另一个标签页刚吊销过）要出现在刚点下的确认框里，
			// 不是页角的 toast——框还开着，人正盯着它
			meta: { suppressErrorToast: true },
			onSuccess: () => {
				queryClient.invalidateQueries({ queryKey: orpc.apiTokens.list.key() });
				toast.success(`token「${token.name}」已吊销`);
				setConfirming(false);
			},
		})
	);

	const { mutate, reset } = revoke;

	const confirm = useCallback(
		() => mutate({ id: token.id }),
		[mutate, token.id]
	);

	const openConfirm = useCallback(() => {
		// 打开确认框前清掉上一次的错误，否则会看到一条与这次无关的报错
		reset();
		setConfirming(true);
	}, [reset]);

	const closeConfirm = useCallback(() => setConfirming(false), []);

	return {
		closeConfirm,
		confirm,
		confirming,
		error: revoke.error?.message,
		isPending: revoke.isPending,
		openConfirm,
	};
}

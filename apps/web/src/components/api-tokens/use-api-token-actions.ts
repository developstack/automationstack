import type { ApiTokenView } from "@automationstack/db/schema/api-tokens";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { toast } from "sonner";

import { orpc } from "@/utils/orpc";

export interface ApiTokenActions {
	closeConfirm: () => void;
	confirm: () => void;
	confirming: boolean;
	error: string | undefined;
	isPending: boolean;
	openConfirm: () => void;
}

export function useApiTokenActions(token: ApiTokenView): ApiTokenActions {
	const queryClient = useQueryClient();
	const [confirming, setConfirming] = useState(false);

	const revoke = useMutation(
		orpc.apiTokens.revoke.mutationOptions({
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

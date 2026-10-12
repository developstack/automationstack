import type { PublicUser } from "@automationstack/db/schema/users";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { toast } from "sonner";

import {
	PLATFORM_ROLE_LABEL,
	type PlatformUserConfirm,
} from "@/components/platform-users/platform-user-meta";
import { orpc } from "@/utils/orpc";

export interface PlatformUserActions {
	closeConfirm: () => void;
	confirm: () => void;
	error: string | undefined;
	isPending: boolean;
	open: (confirm: PlatformUserConfirm) => void;
	/** 等待确认的操作。没有打开确认对话框时为 null。 */
	pending: PlatformUserConfirm | null;
}

type Settle = (message: string) => void;

function useRoleMutation(settle: Settle) {
	return useMutation(
		orpc.users.setRole.mutationOptions({
			meta: { suppressErrorToast: true },
			onSuccess: (user) =>
				settle(`「${user.username}」已设为${PLATFORM_ROLE_LABEL[user.role]}`),
		})
	);
}

function useDisabledMutation(settle: Settle) {
	return useMutation(
		orpc.users.setDisabled.mutationOptions({
			meta: { suppressErrorToast: true },
			onSuccess: (user) =>
				settle(
					`「${user.username}」已${user.disabledAt === null ? "恢复" : "停用"}`
				),
		})
	);
}

export function usePlatformUserActions(user: PublicUser): PlatformUserActions {
	const queryClient = useQueryClient();
	const [pending, setPending] = useState<PlatformUserConfirm | null>(null);

	const settle = useCallback(
		(message: string) => {
			queryClient.invalidateQueries({
				queryKey: orpc.users.listWithProjects.key(),
			});
			toast.success(message);
			setPending(null);
		},
		[queryClient]
	);

	const setRole = useRoleMutation(settle);
	const setDisabled = useDisabledMutation(settle);

	const confirm = useCallback(() => {
		if (pending?.kind === "set-role") {
			setRole.mutate({ id: user.id, role: pending.role });
			return;
		}
		if (pending !== null) {
			setDisabled.mutate({
				disabled: pending.kind === "disable",
				id: user.id,
			});
		}
	}, [pending, setDisabled, setRole, user.id]);

	const open = useCallback(
		(next: PlatformUserConfirm) => {
			setRole.reset();
			setDisabled.reset();
			setPending(next);
		},
		[setDisabled, setRole]
	);

	const closeConfirm = useCallback(() => setPending(null), []);

	return {
		closeConfirm,
		confirm,
		error: (setRole.error ?? setDisabled.error)?.message,
		isPending: setRole.isPending || setDisabled.isPending,
		open,
		pending,
	};
}

import type { PublicUser } from "@automationstack/db/schema/users";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { toast } from "sonner";

import type { PlatformUserConfirmKind } from "@/components/platform-users/platform-user-meta";
import { orpc } from "@/utils/orpc";

export interface PlatformUserActions {
	closeConfirm: () => void;
	confirm: () => void;
	error: string | undefined;
	isPending: boolean;
	kind: PlatformUserConfirmKind | null;
	open: (kind: PlatformUserConfirmKind) => void;
}

type Settle = (message: string) => void;

function useRoleMutation(settle: Settle) {
	return useMutation(
		orpc.users.setRole.mutationOptions({
			meta: { suppressErrorToast: true },
			onSuccess: (user) =>
				settle(
					`「${user.username}」已${user.role === "admin" ? "设为管理员" : "设为成员"}`
				),
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
	const [kind, setKind] = useState<PlatformUserConfirmKind | null>(null);

	const settle = useCallback(
		(message: string) => {
			queryClient.invalidateQueries({
				queryKey: orpc.users.listWithProjects.key(),
			});
			toast.success(message);
			setKind(null);
		},
		[queryClient]
	);

	const setRole = useRoleMutation(settle);
	const setDisabled = useDisabledMutation(settle);

	const confirm = useCallback(() => {
		if (kind === "demote" || kind === "promote") {
			setRole.mutate({
				id: user.id,
				role: kind === "promote" ? "admin" : "member",
			});
			return;
		}
		if (kind !== null) {
			setDisabled.mutate({ disabled: kind === "disable", id: user.id });
		}
	}, [kind, setDisabled, setRole, user.id]);

	const open = useCallback(
		(next: PlatformUserConfirmKind) => {
			setRole.reset();
			setDisabled.reset();
			setKind(next);
		},
		[setDisabled, setRole]
	);

	const closeConfirm = useCallback(() => setKind(null), []);

	return {
		closeConfirm,
		confirm,
		error: (setRole.error ?? setDisabled.error)?.message,
		isPending: setRole.isPending || setDisabled.isPending,
		kind,
		open,
	};
}

import type { ProjectMemberView } from "@automationstack/db/repositories/project-members-repository";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { toast } from "sonner";

import type { ProjectMemberConfirmKind } from "@/components/project-members/project-member-meta";
import { orpc } from "@/utils/orpc";

export interface ProjectMemberActions {
	closeConfirm: () => void;
	confirm: () => void;
	error: string | undefined;
	isPending: boolean;
	kind: ProjectMemberConfirmKind | null;
	open: (kind: ProjectMemberConfirmKind) => void;
}

type Settle = (message: string) => void;

function useRoleMutation(settle: Settle) {
	return useMutation(
		orpc.projectMembers.updateRole.mutationOptions({
			meta: { suppressErrorToast: true },
			onSuccess: (member) =>
				settle(member.role === "owner" ? "已设为拥有者" : "已设为成员"),
		})
	);
}

function useRemoveMutation(settle: Settle) {
	return useMutation(
		orpc.projectMembers.remove.mutationOptions({
			meta: { suppressErrorToast: true },
			onSuccess: () => settle("已移出项目"),
		})
	);
}

function useSettle(
	projectId: string,
	username: string,
	onSettled: () => void
): Settle {
	const queryClient = useQueryClient();
	return useCallback(
		(message: string) => {
			const input = { projectId };
			queryClient.invalidateQueries({
				queryKey: orpc.projectMembers.list.key({ input }),
			});
			queryClient.invalidateQueries({
				queryKey: orpc.projectMembers.listCandidates.key({ input }),
			});
			toast.success(`「${username}」${message}`);
			onSettled();
		},
		[onSettled, projectId, queryClient, username]
	);
}

export function useProjectMemberActions(
	projectId: string,
	member: ProjectMemberView
): ProjectMemberActions {
	const [kind, setKind] = useState<ProjectMemberConfirmKind | null>(null);
	const closeConfirm = useCallback(() => setKind(null), []);
	const settle = useSettle(projectId, member.username, closeConfirm);

	const setRole = useRoleMutation(settle);
	const remove = useRemoveMutation(settle);

	const confirm = useCallback(() => {
		if (kind === "remove") {
			remove.mutate({ projectId, userId: member.userId });
			return;
		}
		if (kind !== null) {
			setRole.mutate({
				projectId,
				role: kind === "promote" ? "owner" : "member",
				userId: member.userId,
			});
		}
	}, [kind, member.userId, projectId, remove, setRole]);

	const open = useCallback(
		(next: ProjectMemberConfirmKind) => {
			setRole.reset();
			remove.reset();
			setKind(next);
		},
		[remove, setRole]
	);

	return {
		closeConfirm,
		confirm,
		error: (setRole.error ?? remove.error)?.message,
		isPending: setRole.isPending || remove.isPending,
		kind,
		open,
	};
}

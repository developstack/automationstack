import type { ProjectRole } from "@automationstack/db/schema/project-members";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

import { orpc } from "@/utils/orpc";

function useInvalidateMembership() {
	const queryClient = useQueryClient();
	return useCallback(
		(projectId: string) => {
			queryClient.invalidateQueries({
				queryKey: orpc.users.listWithProjects.key(),
			});
			const input = { projectId };
			queryClient.invalidateQueries({
				queryKey: orpc.projectMembers.list.key({ input }),
			});
			queryClient.invalidateQueries({
				queryKey: orpc.projectMembers.listCandidates.key({ input }),
			});
		},
		[queryClient]
	);
}

export interface UserProjectActions {
	add: (projectId: string, role: ProjectRole) => void;
	error: string | undefined;
	isPending: boolean;
	remove: (projectId: string) => void;
	setRole: (projectId: string, role: ProjectRole) => void;
}

function useMembershipMutations() {
	const invalidate = useInvalidateMembership();

	const addMutation = useMutation(
		orpc.projectMembers.add.mutationOptions({
			meta: { suppressErrorToast: true },
			onSuccess: (member) => invalidate(member.projectId),
		})
	);
	const removeMutation = useMutation(
		orpc.projectMembers.remove.mutationOptions({
			meta: { suppressErrorToast: true },
			onSuccess: (result) => invalidate(result.projectId),
		})
	);
	const roleMutation = useMutation(
		orpc.projectMembers.updateRole.mutationOptions({
			meta: { suppressErrorToast: true },
			onSuccess: (member) => invalidate(member.projectId),
		})
	);

	const resetAll = useCallback(() => {
		addMutation.reset();
		removeMutation.reset();
		roleMutation.reset();
	}, [addMutation, removeMutation, roleMutation]);

	return { addMutation, removeMutation, resetAll, roleMutation };
}

export function useUserProjectActions(userId: string): UserProjectActions {
	const { addMutation, removeMutation, resetAll, roleMutation } =
		useMembershipMutations();

	const add = useCallback(
		(projectId: string, role: ProjectRole) => {
			resetAll();
			addMutation.mutate({ projectId, role, userId });
		},
		[addMutation, resetAll, userId]
	);

	const remove = useCallback(
		(projectId: string) => {
			resetAll();
			removeMutation.mutate({ projectId, userId });
		},
		[removeMutation, resetAll, userId]
	);

	const setRole = useCallback(
		(projectId: string, role: ProjectRole) => {
			resetAll();
			roleMutation.mutate({ projectId, role, userId });
		},
		[resetAll, roleMutation, userId]
	);

	return {
		add,
		error: (addMutation.error ?? removeMutation.error ?? roleMutation.error)
			?.message,
		isPending:
			addMutation.isPending ||
			removeMutation.isPending ||
			roleMutation.isPending,
		remove,
		setRole,
	};
}

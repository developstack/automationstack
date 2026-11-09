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
	add: (projectId: string) => void;
	error: string | undefined;
	isPending: boolean;
	remove: (projectId: string) => void;
}

/** 把一个用户加入项目或移出项目。改动即时生效。 */
export function useUserProjectActions(userId: string): UserProjectActions {
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

	const add = useCallback(
		(projectId: string) => {
			removeMutation.reset();
			addMutation.mutate({ projectId, userId });
		},
		[addMutation, removeMutation, userId]
	);

	const remove = useCallback(
		(projectId: string) => {
			addMutation.reset();
			removeMutation.mutate({ projectId, userId });
		},
		[addMutation, removeMutation, userId]
	);

	return {
		add,
		error: (addMutation.error ?? removeMutation.error)?.message,
		isPending: addMutation.isPending || removeMutation.isPending,
		remove,
	};
}

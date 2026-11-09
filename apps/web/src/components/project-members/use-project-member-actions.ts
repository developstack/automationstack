import type { ProjectMemberView } from "@automationstack/db/repositories/project-members-repository";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { toast } from "sonner";

import { orpc } from "@/utils/orpc";

export interface ProjectMemberActions {
	closeConfirm: () => void;
	confirm: () => void;
	confirming: boolean;
	error: string | undefined;
	isPending: boolean;
	open: () => void;
}

/** 移出项目：先确认，成功后刷新成员和候选人列表。 */
export function useProjectMemberActions(
	projectId: string,
	member: ProjectMemberView
): ProjectMemberActions {
	const queryClient = useQueryClient();
	const [confirming, setConfirming] = useState(false);
	const closeConfirm = useCallback(() => setConfirming(false), []);
	const remove = useMutation(
		orpc.projectMembers.remove.mutationOptions({
			meta: { suppressErrorToast: true },
			onSuccess: () => {
				const input = { projectId };
				queryClient.invalidateQueries({
					queryKey: orpc.projectMembers.list.key({ input }),
				});
				queryClient.invalidateQueries({
					queryKey: orpc.projectMembers.listCandidates.key({ input }),
				});
				toast.success(`「${member.username}」已移出项目`);
				closeConfirm();
			},
		})
	);

	const confirm = useCallback(
		() => remove.mutate({ projectId, userId: member.userId }),
		[member.userId, projectId, remove]
	);

	const open = useCallback(() => {
		remove.reset();
		setConfirming(true);
	}, [remove]);

	return {
		closeConfirm,
		confirm,
		confirming,
		error: remove.error?.message,
		isPending: remove.isPending,
		open,
	};
}

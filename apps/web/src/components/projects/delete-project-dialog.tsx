import type { Project } from "@automationstack/db/schema/projects";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { toast } from "sonner";

import { TypeToConfirmDialog } from "@/components/interaction/type-to-confirm-dialog";
import { useLastNonNull } from "@/components/interaction/use-last-non-null";
import { orpc } from "@/utils/orpc";

interface DeleteProjectDialogProps {
	onClose: () => void;
	project: Project | null;
}

export function DeleteProjectDialog({
	onClose,
	project,
}: DeleteProjectDialogProps) {
	const queryClient = useQueryClient();
	// 关闭动画期间 project 已经是 null，继续显示上一个项目的名称
	const shown = useLastNonNull(project);
	const remove = useMutation(
		orpc.projects.remove.mutationOptions({
			meta: { failureAction: "删除项目" },
			onSuccess: () => {
				queryClient.invalidateQueries({ queryKey: orpc.projects.key() });
				toast.success("项目已删除");
				onClose();
			},
		})
	);
	const handleConfirm = useCallback(() => {
		if (project) {
			remove.mutate({ id: project.id });
		}
	}, [project, remove]);

	return (
		<TypeToConfirmDialog
			confirmLabel="删除项目"
			description="项目下的模块与用例将一并删除，且不可恢复。"
			name={shown?.name ?? ""}
			nameLabel="项目名称"
			onClose={onClose}
			onConfirm={handleConfirm}
			open={project !== null}
			pending={remove.isPending}
			title={`删除项目「${shown?.name ?? ""}」？`}
		/>
	);
}

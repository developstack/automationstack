import type { Project } from "@automationstack/db/schema/projects";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@automationstack/ui/components/alert-dialog";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { toast } from "sonner";

import { useCloseOnDismiss } from "@/components/use-close-on-dismiss";
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
	const remove = useMutation(
		orpc.projects.remove.mutationOptions({
			onSuccess: () => {
				queryClient.invalidateQueries({ queryKey: orpc.projects.key() });
				toast.success("项目已删除");
				onClose();
			},
		})
	);
	const handleOpenChange = useCloseOnDismiss(onClose);
	const handleConfirm = useCallback(() => {
		if (project) {
			remove.mutate({ id: project.id });
		}
	}, [project, remove]);

	return (
		<AlertDialog onOpenChange={handleOpenChange} open={project !== null}>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>删除项目「{project?.name}」？</AlertDialogTitle>
					<AlertDialogDescription>
						删除后项目下的模块与用例将一并删除，且不可恢复。
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel disabled={remove.isPending}>
						取消
					</AlertDialogCancel>
					<AlertDialogAction
						disabled={remove.isPending}
						onClick={handleConfirm}
						variant="destructive"
					>
						删除
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}

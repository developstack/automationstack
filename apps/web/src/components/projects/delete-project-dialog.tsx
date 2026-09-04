/**
 * 删除项目的二次确认框。原与 ProjectFormDialog 同住
 * project-form-dialog.tsx，按「一个文件一个对外组件」拆开。
 */
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

/** Destructive confirmation before removing a project and all its data. */
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
					{/*
					 * 「取消」自己就是关闭触发器：提交中不禁用的话，弱网下点了删除再点取消，
					 * 框会立刻关掉像是没发生过，几秒后请求照样成功——一个不可恢复的动作
					 * （项目连同模块与用例一起没了）就这样在用户以为已经撤回之后执行了。
					 * 与 revoke-api-token-dialog / project-member-confirm-dialog 同一种写法。
					 */}
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

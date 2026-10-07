import type { ModuleTreeNode } from "@automationstack/api/lib/module-tree";
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

interface DeleteModuleDialogProps {
	module: ModuleTreeNode | null;
	onClose: () => void;
	onDeleted: (moduleId: string) => void;
}

export function DeleteModuleDialog({
	module,
	onClose,
	onDeleted,
}: DeleteModuleDialogProps) {
	const queryClient = useQueryClient();
	const remove = useMutation(
		orpc.modules.remove.mutationOptions({
			onSuccess: (result) => {
				queryClient.invalidateQueries({ queryKey: orpc.modules.key() });
				queryClient.invalidateQueries({ queryKey: orpc.cases.key() });
				toast.success("模块已删除");
				onDeleted(result.id);
				onClose();
			},
		})
	);
	const handleOpenChange = useCloseOnDismiss(onClose);
	const handleConfirm = useCallback(() => {
		if (module) {
			remove.mutate({ id: module.id });
		}
	}, [module, remove]);

	return (
		<AlertDialog onOpenChange={handleOpenChange} open={module !== null}>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>删除模块「{module?.name}」？</AlertDialogTitle>
					<AlertDialogDescription>
						其全部子模块与用例将一并删除，且不可恢复。
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>取消</AlertDialogCancel>
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

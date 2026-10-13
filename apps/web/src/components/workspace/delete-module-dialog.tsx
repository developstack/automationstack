import type { ModuleTreeNode } from "@automationstack/api/lib/module-tree";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { toast } from "sonner";

import { TypeToConfirmDialog } from "@/components/interaction/type-to-confirm-dialog";
import { useLastNonNull } from "@/components/interaction/use-last-non-null";
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
	// 关闭动画期间 module 已经是 null，继续显示上一个模块的名称
	const shown = useLastNonNull(module);
	const remove = useMutation(
		orpc.modules.remove.mutationOptions({
			meta: { failureAction: "删除模块" },
			onSuccess: (result) => {
				queryClient.invalidateQueries({ queryKey: orpc.modules.key() });
				queryClient.invalidateQueries({ queryKey: orpc.cases.key() });
				toast.success("模块已删除");
				onDeleted(result.id);
				onClose();
			},
		})
	);
	const handleConfirm = useCallback(() => {
		if (module) {
			remove.mutate({ id: module.id });
		}
	}, [module, remove]);

	return (
		<TypeToConfirmDialog
			confirmLabel="删除模块"
			description="模块的全部子模块与用例将一并删除，且不可恢复。"
			name={shown?.name ?? ""}
			nameLabel="模块名称"
			onClose={onClose}
			onConfirm={handleConfirm}
			open={module !== null}
			pending={remove.isPending}
			title={`删除模块「${shown?.name ?? ""}」？`}
		/>
	);
}

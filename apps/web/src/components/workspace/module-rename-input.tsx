import type { ModuleTreeNode } from "@automationstack/api/lib/module-tree";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { toast } from "sonner";

import {
	type ModuleNameEndTrigger,
	ModuleNameInput,
} from "@/components/workspace/module-name-input";
import { focusModuleLink } from "@/components/workspace/use-module-tree-edit";
import { failureMessage } from "@/utils/failure-message";
import { orpc } from "@/utils/orpc";

interface ModuleRenameInputProps {
	node: ModuleTreeNode;
	onDone: () => void;
}

/**
 * 在模块行中就地重命名。保存后等模块树刷新完再关闭输入框，
 * 所以不会先闪一下旧名称。保存失败时，原因显示在输入框下方。
 */
export function ModuleRenameInput({ node, onDone }: ModuleRenameInputProps) {
	const queryClient = useQueryClient();
	const rename = useMutation(
		orpc.modules.rename.mutationOptions({
			meta: { suppressErrorToast: true },
			onSuccess: async () => {
				await queryClient.invalidateQueries({ queryKey: orpc.modules.key() });
				toast.success("模块已重命名");
			},
		})
	);
	const { mutate, reset } = rename;

	// 用户点击别处（失去焦点）结束编辑时，焦点留在用户点击的地方
	const finish = useCallback(
		(trigger: ModuleNameEndTrigger) => {
			onDone();
			if (trigger !== "blur") {
				focusModuleLink(node.id);
			}
		},
		[node.id, onDone]
	);

	const handleSubmit = useCallback(
		(name: string, trigger: ModuleNameEndTrigger) =>
			mutate({ id: node.id, name }, { onSuccess: () => finish(trigger) }),
		[finish, mutate, node.id]
	);

	return (
		<ModuleNameInput
			defaultValue={node.name}
			error={rename.isError ? failureMessage(undefined, rename.error) : null}
			label={`重命名模块「${node.name}」`}
			onCancel={finish}
			onEdit={reset}
			onSubmit={handleSubmit}
			pending={rename.isPending}
		/>
	);
}

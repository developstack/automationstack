import type { ModuleTreeNode } from "@automationstack/api/lib/module-tree";
import { useMutation } from "@tanstack/react-query";
import { useCallback } from "react";

import {
	type ModuleNameEndTrigger,
	ModuleNameInput,
} from "@/components/workspace/module-name-input";
import {
	focusModuleLink,
	restoreFocusAfterEdit,
} from "@/components/workspace/module-tree-focus";
import {
	inlineMutationError,
	useInlineModuleMutationOptions,
} from "@/components/workspace/use-inline-module-mutation";
import { orpc } from "@/utils/orpc";

const RENAME_TEXT = { action: "重命名模块", success: "模块已重命名" };

interface ModuleRenameInputProps {
	node: ModuleTreeNode;
	onDone: () => void;
}

/** 在模块行中就地重命名。保存失败时，原因显示在输入框下方。 */
export function ModuleRenameInput({ node, onDone }: ModuleRenameInputProps) {
	const options = useInlineModuleMutationOptions(RENAME_TEXT);
	const rename = useMutation(orpc.modules.rename.mutationOptions(options));
	const { mutate } = rename;

	const finish = useCallback(
		(trigger: ModuleNameEndTrigger) => {
			onDone();
			restoreFocusAfterEdit(trigger, () => focusModuleLink(node.id));
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
			error={inlineMutationError(rename)}
			label={`重命名模块「${node.name}」`}
			onCancel={finish}
			onEdit={rename.reset}
			onSubmit={handleSubmit}
			pending={rename.isPending}
		/>
	);
}

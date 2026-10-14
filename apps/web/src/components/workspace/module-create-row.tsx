import { useMutation } from "@tanstack/react-query";
import { FolderIcon } from "lucide-react";
import { useCallback } from "react";

import {
	type ModuleNameEndTrigger,
	ModuleNameInput,
} from "@/components/workspace/module-name-input";
import {
	focusCreateOrigin,
	focusModuleLink,
	restoreFocusAfterEdit,
} from "@/components/workspace/module-tree-focus";
import {
	inlineMutationError,
	useInlineModuleMutationOptions,
} from "@/components/workspace/use-inline-module-mutation";
import { orpc } from "@/utils/orpc";

const CREATE_TEXT = { action: "新建模块", success: "模块已创建" };

interface ModuleCreateRowProps {
	onDone: () => void;
	parentId: string | null;
	projectId: string;
}

function useCreateModule({
	onDone,
	parentId,
	projectId,
}: ModuleCreateRowProps) {
	const options = useInlineModuleMutationOptions(CREATE_TEXT);
	const create = useMutation(orpc.modules.create.mutationOptions(options));
	const { mutate } = create;

	const handleSubmit = useCallback(
		(name: string, trigger: ModuleNameEndTrigger) =>
			mutate(
				{ name, parentId, projectId },
				{
					onSuccess: (created) => {
						onDone();
						restoreFocusAfterEdit(trigger, () => focusModuleLink(created.id));
					},
				}
			),
		[mutate, onDone, parentId, projectId]
	);
	// Esc 取消时焦点回到开始新建的地方；Enter 不会以取消结束（名称为空时提示原因）
	const handleCancel = useCallback(
		(trigger: ModuleNameEndTrigger) => {
			onDone();
			restoreFocusAfterEdit(trigger, () => focusCreateOrigin(parentId));
		},
		[onDone, parentId]
	);
	return { create, handleCancel, handleSubmit };
}

/**
 * 在模块树中就地新建模块：输入框出现在父模块的子模块末尾（根模块在树的末尾），
 * 也就是新模块保存后出现的位置。保存后焦点移到新模块上。
 */
export function ModuleCreateRow(props: ModuleCreateRowProps) {
	const { create, handleCancel, handleSubmit } = useCreateModule(props);

	return (
		<div className="flex items-start gap-1 py-0.5 ps-8 pe-1">
			<FolderIcon
				aria-hidden="true"
				className="icon-stroke-regular mt-1.5 size-3.5 shrink-0 text-muted-foreground"
			/>
			<ModuleNameInput
				defaultValue=""
				error={inlineMutationError(create)}
				label={props.parentId === null ? "新模块名称" : "新子模块名称"}
				onCancel={handleCancel}
				onEdit={create.reset}
				onSubmit={handleSubmit}
				pending={create.isPending}
				placeholder="模块名称，Enter 保存"
			/>
		</div>
	);
}

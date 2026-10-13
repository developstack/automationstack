import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FolderIcon } from "lucide-react";
import { useCallback } from "react";
import { toast } from "sonner";

import {
	type ModuleNameEndTrigger,
	ModuleNameInput,
} from "@/components/workspace/module-name-input";
import {
	focusCreateOrigin,
	focusModuleLink,
} from "@/components/workspace/use-module-tree-edit";
import { failureMessage } from "@/utils/failure-message";
import { orpc } from "@/utils/orpc";

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
	const queryClient = useQueryClient();
	const create = useMutation(
		orpc.modules.create.mutationOptions({
			meta: { suppressErrorToast: true },
			onSuccess: async () => {
				await queryClient.invalidateQueries({ queryKey: orpc.modules.key() });
				toast.success("模块已创建");
			},
		})
	);
	const { mutate } = create;

	// 用户点击别处（失去焦点）结束编辑时，焦点留在用户点击的地方
	const handleSubmit = useCallback(
		(name: string, trigger: ModuleNameEndTrigger) =>
			mutate(
				{ name, parentId, projectId },
				{
					onSuccess: (created) => {
						onDone();
						if (trigger !== "blur") {
							focusModuleLink(created.id);
						}
					},
				}
			),
		[mutate, onDone, parentId, projectId]
	);
	const handleCancel = useCallback(
		(trigger: ModuleNameEndTrigger) => {
			onDone();
			if (trigger === "escape") {
				focusCreateOrigin(parentId);
			}
		},
		[onDone, parentId]
	);
	return { create, handleCancel, handleSubmit };
}

/**
 * 在模块树中就地新建模块：输入框出现在父模块的子模块末尾（根模块在树的末尾），
 * 也就是新模块保存后出现的位置。保存后等模块树刷新完再移除输入框，焦点移到新模块上。
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
				error={create.isError ? failureMessage(undefined, create.error) : null}
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

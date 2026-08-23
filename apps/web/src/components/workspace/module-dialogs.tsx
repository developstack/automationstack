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
import { Button } from "@automationstack/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@automationstack/ui/components/dialog";
import { Input } from "@automationstack/ui/components/input";
import { Label } from "@automationstack/ui/components/label";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type ChangeEvent, type FormEvent, useCallback, useState } from "react";
import { toast } from "sonner";

import { useCloseOnDismiss } from "@/components/use-close-on-dismiss";
import { orpc } from "@/utils/orpc";

export type ModuleDialogState =
	| { kind: "create"; parentId: string | null }
	| { kind: "delete"; module: ModuleTreeNode }
	| null;

interface CreateModuleFormProps {
	onClose: () => void;
	parentId: string | null;
	projectId: string;
}

function useCreateModule(onClose: () => void) {
	const queryClient = useQueryClient();
	return useMutation(
		orpc.modules.create.mutationOptions({
			onSuccess: () => {
				queryClient.invalidateQueries({ queryKey: orpc.modules.key() });
				toast.success("模块已创建");
				onClose();
			},
		})
	);
}

function CreateModuleForm({
	onClose,
	parentId,
	projectId,
}: CreateModuleFormProps) {
	const [name, setName] = useState("");
	const create = useCreateModule(onClose);

	const handleSubmit = useCallback(
		(event: FormEvent<HTMLFormElement>) => {
			event.preventDefault();
			const trimmed = name.trim();
			if (trimmed === "") {
				return;
			}
			create.mutate({ name: trimmed, parentId, projectId });
		},
		[create, name, parentId, projectId]
	);

	const handleChange = useCallback(
		(event: ChangeEvent<HTMLInputElement>) => setName(event.target.value),
		[]
	);

	return (
		<form className="flex flex-col gap-4" onSubmit={handleSubmit}>
			<div className="flex flex-col gap-2">
				<Label htmlFor="module-name">模块名称</Label>
				<Input
					id="module-name"
					onChange={handleChange}
					placeholder="例如：下单流程"
					required={true}
					value={name}
				/>
			</div>
			<DialogFooter>
				<Button onClick={onClose} type="button" variant="outline">
					取消
				</Button>
				<Button disabled={create.isPending} type="submit">
					{create.isPending ? "创建中…" : "创建"}
				</Button>
			</DialogFooter>
		</form>
	);
}

interface CreateModuleDialogProps {
	onClose: () => void;
	/** null 表示对话框关闭；parentId 为 null 时创建根模块。 */
	parentId: string | null | undefined;
	projectId: string;
}

export function CreateModuleDialog({
	onClose,
	parentId,
	projectId,
}: CreateModuleDialogProps) {
	const open = parentId !== undefined;
	const handleOpenChange = useCloseOnDismiss(onClose);
	return (
		<Dialog onOpenChange={handleOpenChange} open={open}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{parentId ? "新建子模块" : "新建根模块"}</DialogTitle>
					<DialogDescription>模块可无限层级嵌套。</DialogDescription>
				</DialogHeader>
				{open ? (
					<CreateModuleForm
						onClose={onClose}
						parentId={parentId ?? null}
						projectId={projectId}
					/>
				) : null}
			</DialogContent>
		</Dialog>
	);
}

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

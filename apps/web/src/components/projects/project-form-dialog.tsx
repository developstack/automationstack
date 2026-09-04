import type { Project } from "@automationstack/db/schema/projects";
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
import { Textarea } from "@automationstack/ui/components/textarea";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type ChangeEvent, type FormEvent, useCallback, useState } from "react";
import { toast } from "sonner";

import { useCloseOnDismiss } from "@/components/use-close-on-dismiss";
import { orpc } from "@/utils/orpc";

function useProjectMutations(onDone: () => void) {
	const queryClient = useQueryClient();
	const settle = (message: string) => {
		queryClient.invalidateQueries({ queryKey: orpc.projects.key() });
		toast.success(message);
		onDone();
	};
	const create = useMutation(
		orpc.projects.create.mutationOptions({
			onSuccess: () => settle("项目已创建"),
		})
	);
	const update = useMutation(
		orpc.projects.update.mutationOptions({
			onSuccess: () => settle("项目已更新"),
		})
	);
	return { create, update };
}

interface ProjectFieldsProps {
	description: string;
	name: string;
	onDescriptionChange: (value: string) => void;
	onNameChange: (value: string) => void;
}

function ProjectFields(props: ProjectFieldsProps) {
	const { onDescriptionChange, onNameChange } = props;
	const handleNameChange = useCallback(
		(event: ChangeEvent<HTMLInputElement>) => onNameChange(event.target.value),
		[onNameChange]
	);
	const handleDescriptionChange = useCallback(
		(event: ChangeEvent<HTMLTextAreaElement>) =>
			onDescriptionChange(event.target.value),
		[onDescriptionChange]
	);

	return (
		<div className="flex flex-col gap-4">
			<div className="flex flex-col gap-2">
				<Label htmlFor="project-name">项目名称</Label>
				<Input
					id="project-name"
					onChange={handleNameChange}
					placeholder="例如：订单中心"
					required={true}
					value={props.name}
				/>
			</div>
			<div className="flex flex-col gap-2">
				<Label htmlFor="project-description">项目描述</Label>
				<Textarea
					id="project-description"
					onChange={handleDescriptionChange}
					placeholder="可选"
					value={props.description}
				/>
			</div>
		</div>
	);
}

interface ProjectFormContentProps {
	onClose: () => void;
	project: Project | null;
}

function ProjectFormContent({ onClose, project }: ProjectFormContentProps) {
	const [name, setName] = useState(project?.name ?? "");
	const [description, setDescription] = useState(project?.description ?? "");
	const { create, update } = useProjectMutations(onClose);
	const saving = create.isPending || update.isPending;

	const handleSubmit = useCallback(
		(event: FormEvent<HTMLFormElement>) => {
			event.preventDefault();
			const trimmedName = name.trim();
			if (trimmedName === "") {
				return;
			}
			const payload = {
				description: description.trim() === "" ? null : description,
				name: trimmedName,
			};
			if (project) {
				update.mutate({ id: project.id, ...payload });
				return;
			}
			create.mutate(payload);
		},
		[create, description, name, project, update]
	);

	return (
		<form className="flex flex-col gap-4" onSubmit={handleSubmit}>
			<ProjectFields
				description={description}
				name={name}
				onDescriptionChange={setDescription}
				onNameChange={setName}
			/>
			<DialogFooter>
				{/* 保存中禁用取消：点了取消框就关，而请求照样会落地，用户以为改动被撤回了 */}
				<Button
					disabled={saving}
					onClick={onClose}
					type="button"
					variant="outline"
				>
					取消
				</Button>
				<Button disabled={saving} type="submit">
					{saving ? "保存中…" : "保存"}
				</Button>
			</DialogFooter>
		</form>
	);
}

interface ProjectFormDialogProps {
	onClose: () => void;
	open: boolean;
	project: Project | null;
}

/** Create (project == null) or edit an existing project. */
export function ProjectFormDialog({
	onClose,
	open,
	project,
}: ProjectFormDialogProps) {
	const handleOpenChange = useCloseOnDismiss(onClose);
	return (
		<Dialog onOpenChange={handleOpenChange} open={open}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{project ? "编辑项目" : "新建项目"}</DialogTitle>
					<DialogDescription>
						{project ? "修改项目名称与描述。" : "创建一个新的测试用例项目。"}
					</DialogDescription>
				</DialogHeader>
				{open ? (
					<ProjectFormContent
						key={project?.id ?? "create"}
						onClose={onClose}
						project={project}
					/>
				) : null}
			</DialogContent>
		</Dialog>
	);
}

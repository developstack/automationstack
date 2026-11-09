import { Button } from "@automationstack/ui/components/button";
import { Label } from "@automationstack/ui/components/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@automationstack/ui/components/select";
import { useQuery } from "@tanstack/react-query";
import { type FormEvent, useCallback, useState } from "react";

import { orpc } from "@/utils/orpc";

const PROJECT_FIELD_ID = "user-project-candidate";
const NO_PROJECT = "__none__";

interface Option {
	label: string;
	value: string;
}

function buildProjectOptions(
	isPending: boolean,
	projects: readonly { id: string; name: string }[],
	memberOf: ReadonlySet<string>
): Option[] {
	const candidates = projects.filter((project) => !memberOf.has(project.id));
	let placeholder = "选择一个项目（他已在的不再列出）";
	if (isPending) {
		placeholder = "载入中…";
	} else if (candidates.length === 0) {
		placeholder = "没有可加入的项目了";
	}
	return [
		{ label: placeholder, value: NO_PROJECT },
		...candidates.map((project) => ({
			label: project.name,
			value: project.id,
		})),
	];
}

interface ProjectFieldProps {
	onChange: (projectId: string) => void;
	options: readonly Option[];
	value: string;
}

function ProjectField({ onChange, options, value }: ProjectFieldProps) {
	const handleValueChange = useCallback(
		(next: string | null) => onChange(next ?? NO_PROJECT),
		[onChange]
	);

	return (
		<Select items={options} onValueChange={handleValueChange} value={value}>
			<SelectTrigger className="w-full sm:flex-1" id={PROJECT_FIELD_ID}>
				<SelectValue />
			</SelectTrigger>
			<SelectContent>
				{options.map((option) => (
					<SelectItem key={option.value} value={option.value}>
						{option.label}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}

interface UserProjectAddFormProps {
	disabled: boolean;
	memberOf: ReadonlySet<string>;
	onAdd: (projectId: string) => void;
}

export function UserProjectAddForm({
	disabled,
	memberOf,
	onAdd,
}: UserProjectAddFormProps) {
	const projectsQuery = useQuery(orpc.projects.list.queryOptions());
	const [projectId, setProjectId] = useState(NO_PROJECT);
	const options = buildProjectOptions(
		projectsQuery.isPending,
		projectsQuery.data ?? [],
		memberOf
	);

	const handleSubmit = useCallback(
		(event: FormEvent<HTMLFormElement>) => {
			event.preventDefault();
			if (projectId === NO_PROJECT) {
				return;
			}
			onAdd(projectId);
			setProjectId(NO_PROJECT);
		},
		[onAdd, projectId]
	);

	return (
		<form
			className="flex flex-col gap-2 border-t pt-4"
			noValidate={true}
			onSubmit={handleSubmit}
		>
			<Label htmlFor={PROJECT_FIELD_ID}>加入项目</Label>
			<div className="flex flex-col gap-2 sm:flex-row sm:items-center">
				<ProjectField
					onChange={setProjectId}
					options={options}
					value={projectId}
				/>
				<Button disabled={disabled || projectId === NO_PROJECT} type="submit">
					加入
				</Button>
			</div>
		</form>
	);
}

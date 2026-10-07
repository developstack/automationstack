import type { ProjectRole } from "@automationstack/db/schema/project-members";
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

import { PROJECT_ROLE_OPTIONS } from "@/components/project-members/project-member-meta";
import { orpc } from "@/utils/orpc";

const PROJECT_FIELD_ID = "user-project-candidate";
const ROLE_FIELD_ID = "user-project-role";
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

interface RoleFieldProps {
	onChange: (role: ProjectRole) => void;
	value: ProjectRole;
}

function RoleField({ onChange, value }: RoleFieldProps) {
	const handleValueChange = useCallback(
		(next: string | null) => {
			if (next === "member" || next === "owner") {
				onChange(next);
			}
		},
		[onChange]
	);

	return (
		<Select
			items={PROJECT_ROLE_OPTIONS}
			onValueChange={handleValueChange}
			value={value}
		>
			<SelectTrigger
				aria-label="加入时的项目角色"
				className="w-full sm:w-32"
				id={ROLE_FIELD_ID}
			>
				<SelectValue />
			</SelectTrigger>
			<SelectContent>
				{PROJECT_ROLE_OPTIONS.map((option) => (
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
	onAdd: (projectId: string, role: ProjectRole) => void;
}

export function UserProjectAddForm({
	disabled,
	memberOf,
	onAdd,
}: UserProjectAddFormProps) {
	const projectsQuery = useQuery(orpc.projects.list.queryOptions());
	const [projectId, setProjectId] = useState(NO_PROJECT);
	const [role, setRole] = useState<ProjectRole>("member");
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
			onAdd(projectId, role);
			setProjectId(NO_PROJECT);
		},
		[onAdd, projectId, role]
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
				<RoleField onChange={setRole} value={role} />
				<Button disabled={disabled || projectId === NO_PROJECT} type="submit">
					加入
				</Button>
			</div>
		</form>
	);
}

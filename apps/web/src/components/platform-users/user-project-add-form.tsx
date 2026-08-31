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
/**
 * 「还没选项目」的哨兵值。
 * Base UI 的 Select 用 null 表示未选中，而未选中态在这张表里要有一行可见的提示
 * 文字（空触发器看不出是没选还是加载失败），所以照 add-project-member-dialog 的
 * 做法用一个假选项占位，提交前再把它当作校验失败。
 */
const NO_PROJECT = "__none__";

interface Option {
	label: string;
	value: string;
}

/**
 * 候选项目 = 平台上的全部项目减去他已经在的那些。
 *
 * 加载中与「没有可加的项目了」共用第一行提示：两种情况下都没得选，差别只在文字，
 * 而分成两条渲染路径会让下拉框在数据到达那一帧整个换掉一次。
 */
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

/** 项目下拉。可见标签是表单里那一句「加入项目」，靠 id 关联。 */
function ProjectField({ onChange, options, value }: ProjectFieldProps) {
	const handleValueChange = useCallback(
		// Base UI 的清空动作会给 null，此时退回哨兵值而不是掉进未定义状态
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

/** 加入时的项目角色。与 project-members/add-project-member-dialog 里的 RoleField
 * 同形而不共用：那一份带可见标签、独占一行，这一份是同排里的窄下拉。 */
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
			{/* 可访问名靠 aria-label：这一栏没有自己的可见标签，上面那个是项目的 */}
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
	/** 他已经在的项目 id：这些不再出现在候选里。 */
	memberOf: ReadonlySet<string>;
	onAdd: (projectId: string, role: ProjectRole) => void;
}

/**
 * 对话框底部那张「加进一个项目」的小表：选项目 + 选角色 + 提交。
 *
 * 项目候选走 `projects.list`（平台 admin 看得到全部），而不是项目内那条
 * `projectMembers.listCandidates`——后者问的是「这个项目还能加谁」，这里问的
 * 恰好反过来：「这个人还能进哪个项目」。两条方向相反，套不上。
 */
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
			// 加完把选择退回哨兵：这张表会连着用好几次，留着上一个项目容易误点
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
			{/* 窄屏下三个控件各占一行；sm 起并成一排，项目名那栏吃掉多余宽度 */}
			<div className="flex flex-col gap-2 sm:flex-row sm:items-center">
				<ProjectField
					onChange={setProjectId}
					options={options}
					value={projectId}
				/>
				<RoleField onChange={setRole} value={role} />
				{/*
				 * 没选项目时按钮禁用，而不是提交后再报一句「请选择项目」：这张表只有
				 * 一个必填项，禁用态本身就说清了差什么。
				 */}
				<Button disabled={disabled || projectId === NO_PROJECT} type="submit">
					加入
				</Button>
			</div>
		</form>
	);
}

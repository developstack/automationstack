/**
 * 项目卡片栅格与它的空态。原是 project-list.tsx 里的私有辅助，
 * 按「同文件最多 2 个私有辅助组件」拆出来；单张卡片只服务于这张栅格，
 * 跟着一起搬。
 */
import type { Project } from "@automationstack/db/schema/projects";
import { Button } from "@automationstack/ui/components/button";
import {
	Card,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@automationstack/ui/components/card";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@automationstack/ui/components/dropdown-menu";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from "@automationstack/ui/components/empty";
import { Link } from "@tanstack/react-router";
import { MoreHorizontalIcon } from "lucide-react";
import { useCallback } from "react";

import { formatDateTime } from "@/components/cases/case-meta";

interface ProjectCardProps {
	onDelete: (project: Project) => void;
	onEdit: (project: Project) => void;
	project: Project;
}

function ProjectCard({ onDelete, onEdit, project }: ProjectCardProps) {
	const handleEdit = useCallback(() => onEdit(project), [onEdit, project]);
	const handleDelete = useCallback(
		() => onDelete(project),
		[onDelete, project]
	);

	return (
		<Card>
			<CardHeader>
				<CardTitle>
					{/*
					 * 进项目落在概览，不是用例列表：「这个项目现在什么状况」是进来之后
					 * 的第一个问题，用例列表是接下来的动作。项目根路径本身仍旧是用例
					 * 列表（一级侧栏「用例管理」那一项就指着它），这里改的只是入口的落点。
					 */}
					<Link
						className="hover:underline"
						params={{ projectId: project.id }}
						to="/projects/$projectId/overview"
					>
						{project.name}
					</Link>
				</CardTitle>
				<CardDescription className="line-clamp-2">
					{project.description ?? "暂无描述"}
				</CardDescription>
				<div className="flex items-center justify-between gap-2 text-muted-foreground text-xs">
					<span>更新于 {formatDateTime(project.updatedAt)}</span>
					<DropdownMenu>
						{/* 带项目名：读屏的按钮列表里，同名的「项目操作」互相分辨不出来 */}
						<DropdownMenuTrigger
							render={
								<Button
									aria-label={`项目「${project.name}」操作`}
									size="icon-xs"
									variant="ghost"
								>
									<MoreHorizontalIcon />
								</Button>
							}
						/>
						<DropdownMenuContent align="end">
							<DropdownMenuItem onClick={handleEdit}>编辑</DropdownMenuItem>
							<DropdownMenuItem onClick={handleDelete} variant="destructive">
								删除
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				</div>
			</CardHeader>
		</Card>
	);
}

function ProjectsEmpty() {
	return (
		<Empty>
			<EmptyHeader>
				<EmptyTitle>还没有项目</EmptyTitle>
				<EmptyDescription>点击「新建项目」创建第一个项目。</EmptyDescription>
			</EmptyHeader>
		</Empty>
	);
}

interface ProjectCardsProps {
	onDelete: (project: Project) => void;
	onEdit: (project: Project) => void;
	projects: Project[];
}

export function ProjectCards({
	onDelete,
	onEdit,
	projects,
}: ProjectCardsProps) {
	if (projects.length === 0) {
		return <ProjectsEmpty />;
	}
	return (
		<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
			{projects.map((project) => (
				<ProjectCard
					key={project.id}
					onDelete={onDelete}
					onEdit={onEdit}
					project={project}
				/>
			))}
		</div>
	);
}

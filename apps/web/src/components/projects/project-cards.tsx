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

function ProjectsEmpty({ canCreate }: { canCreate: boolean }) {
	return (
		<Empty>
			<EmptyHeader>
				<EmptyTitle>还没有项目</EmptyTitle>
				<EmptyDescription>
					{canCreate
						? "点击「新建项目」创建第一个项目。"
						: "你还没有加入任何项目，请联系项目 owner 把你加入项目。"}
				</EmptyDescription>
			</EmptyHeader>
		</Empty>
	);
}

interface ProjectCardsProps {
	/** 当前用户能否新建项目。决定空状态的提示。 */
	canCreate: boolean;
	onDelete: (project: Project) => void;
	onEdit: (project: Project) => void;
	projects: Project[];
}

export function ProjectCards({
	canCreate,
	onDelete,
	onEdit,
	projects,
}: ProjectCardsProps) {
	if (projects.length === 0) {
		return <ProjectsEmpty canCreate={canCreate} />;
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

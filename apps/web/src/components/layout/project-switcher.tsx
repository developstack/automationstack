import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
} from "@automationstack/ui/components/dropdown-menu";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { FolderKanbanIcon } from "lucide-react";

import { ProjectSwitcherItem } from "@/components/layout/project-switcher-item";
import { ProjectSwitcherTrigger } from "@/components/layout/project-switcher-trigger";
import { orpc } from "@/utils/orpc";

function ProjectSwitcherPlaceholder({ label }: { label: string }) {
	return <DropdownMenuItem disabled>{label}</DropdownMenuItem>;
}

function ProjectSwitcherItems({
	currentProjectId,
}: {
	currentProjectId: string;
}) {
	const projectsQuery = useQuery(orpc.projects.list.queryOptions());
	if (projectsQuery.isPending) {
		return <ProjectSwitcherPlaceholder label="加载中…" />;
	}
	if (projectsQuery.isError) {
		return <ProjectSwitcherPlaceholder label="项目列表加载失败" />;
	}
	const projects = projectsQuery.data ?? [];
	if (projects.length === 0) {
		return <ProjectSwitcherPlaceholder label="暂无项目" />;
	}
	return projects.map((project) => (
		<ProjectSwitcherItem
			isCurrent={project.id === currentProjectId}
			key={project.id}
			project={project}
		/>
	));
}

interface ProjectSwitcherProps {
	projectId: string;
	projectName: string;
}

export function ProjectSwitcher({
	projectId,
	projectName,
}: ProjectSwitcherProps) {
	return (
		<DropdownMenu>
			<ProjectSwitcherTrigger projectId={projectId} projectName={projectName} />
			<DropdownMenuContent align="start">
				<ProjectSwitcherItems currentProjectId={projectId} />
				<DropdownMenuSeparator />
				<DropdownMenuItem render={<Link to="/projects" />}>
					<FolderKanbanIcon aria-hidden="true" />
					查看全部项目
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

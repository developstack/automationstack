import {
	Sidebar,
	SidebarContent,
	SidebarRail,
} from "@automationstack/ui/components/sidebar";
import { Skeleton } from "@automationstack/ui/components/skeleton";

import { ProjectMark } from "@/components/layout/project-mark";
import { ProjectNavGroup } from "@/components/layout/project-nav-group";
import { ProjectSwitcher } from "@/components/layout/project-switcher";
import { SidebarExpandButton } from "@/components/layout/sidebar-expand-button";
import { SidebarTopRow } from "@/components/layout/sidebar-top-row";
import { SidebarUser } from "@/components/layout/sidebar-user";

const PROJECT_FALLBACK_LABEL = "项目";

interface ProjectSidebarHeaderProps {
	projectId: string;
	projectName: string | undefined;
}

/** 项目以内的侧栏顶部只显示项目切换器，不显示平台的名称和图标。 */
function ProjectSidebarHeader({
	projectId,
	projectName,
}: ProjectSidebarHeaderProps) {
	const isLoading = projectName === undefined;
	return (
		<SidebarTopRow>
			<div className="w-full group-data-[collapsible=icon]:hidden">
				{isLoading ? (
					<Skeleton aria-hidden="true" className="h-12 w-full rounded-md" />
				) : (
					<ProjectSwitcher projectId={projectId} projectName={projectName} />
				)}
			</div>
			<SidebarExpandButton
				label={projectName ?? PROJECT_FALLBACK_LABEL}
				mark={
					isLoading ? (
						<Skeleton aria-hidden="true" className="size-8 rounded-sm" />
					) : (
						<ProjectMark projectName={projectName} />
					)
				}
			/>
		</SidebarTopRow>
	);
}

interface ProjectSidebarProps {
	projectId: string;
	projectName?: string;
}

export function ProjectSidebar({
	projectId,
	projectName,
}: ProjectSidebarProps) {
	return (
		<Sidebar>
			<ProjectSidebarHeader projectId={projectId} projectName={projectName} />
			<SidebarContent>
				<ProjectNavGroup projectId={projectId} />
			</SidebarContent>
			<SidebarUser />
			<SidebarRail />
		</Sidebar>
	);
}

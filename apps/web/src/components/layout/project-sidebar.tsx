import {
	Sidebar,
	SidebarContent,
	SidebarGroup,
	SidebarRail,
} from "@automationstack/ui/components/sidebar";
import {
	SidebarMenu,
	SidebarMenuItem,
} from "@automationstack/ui/components/sidebar-menu";
import { Skeleton } from "@automationstack/ui/components/skeleton";

import { ProjectNavGroup } from "@/components/layout/project-nav-group";
import { ProjectSwitcher } from "@/components/layout/project-switcher";
import { SidebarBrand } from "@/components/layout/sidebar-brand";
import { SidebarUser } from "@/components/layout/sidebar-user";

interface ProjectSwitcherRowProps {
	projectId: string;
	projectName: string | undefined;
}

function ProjectSwitcherRow({
	projectId,
	projectName,
}: ProjectSwitcherRowProps) {
	return (
		<SidebarGroup className="group-data-[collapsible=icon]:hidden">
			<SidebarMenu>
				<SidebarMenuItem>
					{projectName === undefined ? (
						<Skeleton aria-hidden="true" className="h-8 w-full" />
					) : (
						<ProjectSwitcher projectId={projectId} projectName={projectName} />
					)}
				</SidebarMenuItem>
			</SidebarMenu>
		</SidebarGroup>
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
			<SidebarBrand />
			<SidebarContent>
				<ProjectSwitcherRow projectId={projectId} projectName={projectName} />
				<ProjectNavGroup projectId={projectId} />
			</SidebarContent>
			<SidebarUser />
			<SidebarRail />
		</Sidebar>
	);
}

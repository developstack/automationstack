import { SidebarGroup } from "@automationstack/ui/components/sidebar";
import {
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
} from "@automationstack/ui/components/sidebar-menu";
import { Link, useRouterState } from "@tanstack/react-router";
import { LayoutDashboardIcon, ListChecksIcon } from "lucide-react";

import { isCaseSectionPathname } from "@/components/layout/case-section-path";
import { ProjectSettingsNavItem } from "@/components/layout/project-settings-nav-item";
import { ProjectUsersNavItem } from "@/components/layout/project-users-nav-item";
import { TestRunsNavItem } from "@/components/layout/test-runs-nav-item";

const selectPathname = (state: { location: { pathname: string } }) =>
	state.location.pathname;

interface NavItemProps {
	pathname: string;
	projectId: string;
}

function OverviewNavItem({ pathname, projectId }: NavItemProps) {
	return (
		<SidebarMenuItem>
			<SidebarMenuButton
				aria-label="项目概览"
				isActive={pathname.startsWith(`/projects/${projectId}/overview`)}
				render={
					<Link params={{ projectId }} to="/projects/$projectId/overview" />
				}
				tooltip="项目概览"
			>
				<LayoutDashboardIcon aria-hidden="true" />
				<span>项目概览</span>
			</SidebarMenuButton>
		</SidebarMenuItem>
	);
}

function CasesNavItem({ pathname, projectId }: NavItemProps) {
	return (
		<SidebarMenuItem>
			<SidebarMenuButton
				aria-label="用例管理"
				isActive={isCaseSectionPathname(pathname, projectId)}
				render={
					<Link
						activeOptions={{ exact: true }}
						params={{ projectId }}
						to="/projects/$projectId"
					/>
				}
				tooltip="用例管理"
			>
				<ListChecksIcon aria-hidden="true" />
				<span>用例管理</span>
			</SidebarMenuButton>
		</SidebarMenuItem>
	);
}

interface ProjectNavGroupProps {
	projectId: string;
}

export function ProjectNavGroup({ projectId }: ProjectNavGroupProps) {
	const pathname = useRouterState({ select: selectPathname });
	return (
		<SidebarGroup>
			<SidebarMenu>
				<OverviewNavItem pathname={pathname} projectId={projectId} />
				<CasesNavItem pathname={pathname} projectId={projectId} />
				<TestRunsNavItem pathname={pathname} projectId={projectId} />
				<ProjectUsersNavItem pathname={pathname} projectId={projectId} />
				<ProjectSettingsNavItem pathname={pathname} projectId={projectId} />
			</SidebarMenu>
		</SidebarGroup>
	);
}

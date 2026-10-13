import {
	Sidebar,
	SidebarContent,
	SidebarGroup,
	SidebarGroupLabel,
	SidebarRail,
} from "@automationstack/ui/components/sidebar";
import {
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
} from "@automationstack/ui/components/sidebar-menu";
import { Link, useRouterState } from "@tanstack/react-router";
import { FolderKanbanIcon } from "lucide-react";

import { useSession } from "@/components/auth/use-session";
import { AuthSettingsNavItem } from "@/components/layout/auth-settings-nav-item";
import { PlatformUsersNavItem } from "@/components/layout/platform-users-nav-item";
import { SidebarBrand } from "@/components/layout/sidebar-brand";
import { SidebarUser } from "@/components/layout/sidebar-user";

const PLATFORM_GROUP_LABEL_ID = "platform-nav";

const selectPathname = (state: { location: { pathname: string } }) =>
	state.location.pathname;

function ProjectsNavItem({ pathname }: { pathname: string }) {
	return (
		<SidebarMenuItem>
			<SidebarMenuButton
				aria-label="项目"
				isActive={pathname.startsWith("/projects")}
				render={<Link activeOptions={{ exact: true }} to="/projects" />}
				tooltip="项目"
			>
				<FolderKanbanIcon aria-hidden="true" />
				<span>项目</span>
			</SidebarMenuButton>
		</SidebarMenuItem>
	);
}

function PlatformNavGroup() {
	const pathname = useRouterState({ select: selectPathname });
	const { user } = useSession();

	return (
		<SidebarGroup>
			<SidebarGroupLabel id={PLATFORM_GROUP_LABEL_ID}>平台</SidebarGroupLabel>
			<SidebarMenu aria-labelledby={PLATFORM_GROUP_LABEL_ID}>
				<ProjectsNavItem pathname={pathname} />
				{user?.role === "admin" ? (
					<>
						<PlatformUsersNavItem pathname={pathname} />
						<AuthSettingsNavItem pathname={pathname} />
					</>
				) : null}
			</SidebarMenu>
		</SidebarGroup>
	);
}

export function PlatformSidebar() {
	return (
		<Sidebar>
			<SidebarBrand />
			<SidebarContent>
				<PlatformNavGroup />
			</SidebarContent>
			<SidebarUser />
			<SidebarRail />
		</Sidebar>
	);
}

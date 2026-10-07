import {
	SidebarMenuButton,
	SidebarMenuItem,
} from "@automationstack/ui/components/sidebar-menu";
import { Link } from "@tanstack/react-router";
import { UsersIcon } from "lucide-react";

interface NavItemProps {
	pathname: string;
	projectId: string;
}

export function ProjectUsersNavItem({ pathname, projectId }: NavItemProps) {
	return (
		<SidebarMenuItem>
			<SidebarMenuButton
				aria-label="成员"
				isActive={pathname.startsWith(`/projects/${projectId}/users`)}
				render={<Link params={{ projectId }} to="/projects/$projectId/users" />}
				tooltip="成员"
			>
				<UsersIcon aria-hidden="true" />
				<span>成员</span>
			</SidebarMenuButton>
		</SidebarMenuItem>
	);
}

import {
	SidebarMenuButton,
	SidebarMenuItem,
} from "@automationstack/ui/components/sidebar-menu";
import { Link } from "@tanstack/react-router";
import { SettingsIcon } from "lucide-react";

interface NavItemProps {
	pathname: string;
	projectId: string;
}

export function ProjectSettingsNavItem({ pathname, projectId }: NavItemProps) {
	return (
		<SidebarMenuItem>
			<SidebarMenuButton
				aria-label="设置"
				isActive={pathname.startsWith(`/projects/${projectId}/settings`)}
				render={
					<Link params={{ projectId }} to="/projects/$projectId/settings" />
				}
				tooltip="设置"
			>
				<SettingsIcon aria-hidden="true" />
				<span>设置</span>
			</SidebarMenuButton>
		</SidebarMenuItem>
	);
}

import {
	SidebarMenuButton,
	SidebarMenuItem,
} from "@automationstack/ui/components/sidebar-menu";
import { Link } from "@tanstack/react-router";
import { UsersIcon } from "lucide-react";

export function PlatformUsersNavItem({ pathname }: { pathname: string }) {
	return (
		<SidebarMenuItem>
			<SidebarMenuButton
				aria-label="用户"
				isActive={pathname.startsWith("/users")}
				render={<Link to="/users" />}
				tooltip="用户"
			>
				<UsersIcon aria-hidden="true" />
				<span>用户</span>
			</SidebarMenuButton>
		</SidebarMenuItem>
	);
}

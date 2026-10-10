import {
	SidebarMenuButton,
	SidebarMenuItem,
} from "@automationstack/ui/components/sidebar-menu";
import { Link } from "@tanstack/react-router";
import { KeyRoundIcon } from "lucide-react";

export function AuthSettingsNavItem({ pathname }: { pathname: string }) {
	return (
		<SidebarMenuItem>
			<SidebarMenuButton
				aria-label="认证设置"
				isActive={pathname.startsWith("/settings/auth")}
				render={<Link to="/settings/auth" />}
				tooltip="认证设置"
			>
				<KeyRoundIcon aria-hidden="true" />
				<span>认证设置</span>
			</SidebarMenuButton>
		</SidebarMenuItem>
	);
}

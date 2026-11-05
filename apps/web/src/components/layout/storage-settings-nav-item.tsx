import {
	SidebarMenuButton,
	SidebarMenuItem,
} from "@automationstack/ui/components/sidebar-menu";
import { Link } from "@tanstack/react-router";
import { HardDriveIcon } from "lucide-react";

export function StorageSettingsNavItem({ pathname }: { pathname: string }) {
	return (
		<SidebarMenuItem>
			<SidebarMenuButton
				aria-label="存储设置"
				isActive={pathname.startsWith("/settings/storage")}
				render={<Link to="/settings/storage" />}
				tooltip="存储设置"
			>
				<HardDriveIcon aria-hidden="true" />
				<span>存储设置</span>
			</SidebarMenuButton>
		</SidebarMenuItem>
	);
}

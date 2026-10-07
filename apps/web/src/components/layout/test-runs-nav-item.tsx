import {
	SidebarMenuButton,
	SidebarMenuItem,
} from "@automationstack/ui/components/sidebar-menu";
import { Link } from "@tanstack/react-router";
import { ClipboardListIcon } from "lucide-react";

interface NavItemProps {
	pathname: string;
	projectId: string;
}

export function TestRunsNavItem({ pathname, projectId }: NavItemProps) {
	return (
		<SidebarMenuItem>
			<SidebarMenuButton
				aria-label="测试任务"
				isActive={pathname.startsWith(`/projects/${projectId}/test-runs`)}
				render={
					<Link params={{ projectId }} to="/projects/$projectId/test-runs" />
				}
				tooltip="测试任务"
			>
				<ClipboardListIcon aria-hidden="true" />
				<span>测试任务</span>
			</SidebarMenuButton>
		</SidebarMenuItem>
	);
}

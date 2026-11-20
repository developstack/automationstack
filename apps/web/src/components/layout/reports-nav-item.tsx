import {
	SidebarMenuButton,
	SidebarMenuItem,
} from "@automationstack/ui/components/sidebar-menu";
import { Link } from "@tanstack/react-router";
import { FileTextIcon } from "lucide-react";

interface NavItemProps {
	pathname: string;
	projectId: string;
}

export function ReportsNavItem({ pathname, projectId }: NavItemProps) {
	return (
		<SidebarMenuItem>
			<SidebarMenuButton
				aria-label="测试报告"
				isActive={pathname.startsWith(`/projects/${projectId}/reports`)}
				render={
					<Link params={{ projectId }} to="/projects/$projectId/reports" />
				}
				tooltip="测试报告"
			>
				<FileTextIcon aria-hidden="true" />
				<span>测试报告</span>
			</SidebarMenuButton>
		</SidebarMenuItem>
	);
}

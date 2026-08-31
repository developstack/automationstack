/**
 * 项目内一级侧栏的「测试任务」一项，自 project-nav-group.tsx 拆出。
 * pathname 仍由那一层一次性订阅、再传下来（理由见那份文件顶部）。
 */
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
				/*
				 * 按前缀算：详情 /test-runs/<id> 与报告 /test-runs/<id>/report 都在这一支
				 * 下面，人在它们上面时这一行同样要亮着。
				 */
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

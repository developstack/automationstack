/**
 * 项目内一级侧栏的「设置」一项，自 project-nav-group.tsx 拆出。
 * pathname 仍由那一层一次性订阅、再传下来（理由见那份文件顶部）。
 */
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

/**
 * 设置。
 *
 * 这一项曾经指向全局的 /settings，把当前项目通过 search 带过去；那时它是**离开**
 * 项目外壳的出口——落地后渲染的是另一套外壳（AppShell + 全局侧栏），这条侧栏根本
 * 不在屏幕上，所以当时刻意不给 isActive，算一个永远为假的高亮只会留下死代码。
 * 设置页如今就在项目里（/projects/<id>/settings，四个顶级路由已合并进它的五格
 * tab），这一项与上面三项一样是项目内部的一站，高亮该照常亮。
 *
 * 按前缀算：五格 tab 只落在 search 的 `tab` 上，pathname 自始至终是这一条；
 * 前缀写法同时兜住将来在设置底下再长出子路由的情况。
 *
 * activeOptions 不给（即默认的前缀判定）：与「项目管理」「用例管理」那两项不同，
 * 这一项的落点没有更深的子页面可去，前缀为真时人就在这一页上，
 * aria-current="page" 是真话。
 */
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

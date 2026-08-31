/**
 * 项目内一级侧栏的「成员」一项，自 project-nav-group.tsx 拆出。
 * pathname 仍由那一层一次性订阅、再传下来（理由见那份文件顶部）。
 */
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

/**
 * 成员。
 *
 * 对**所有**项目成员可见，不按角色隐藏：普通成员点进去看到的是一份只读名单，
 * 那正是他需要的（队友是谁、找谁要权限）。按角色藏掉这一项会让人以为平台压根
 * 没有成员管理这回事，于是去问一个本来就有答案的问题；能不能改由页面里的操作
 * 控件回答，而不是由「这一项在不在」回答。
 *
 * 按前缀算，理由同「设置」那一项：这一支目前没有更深的子页面，将来长出来了
 * （比如某个成员的详情）前缀写法也仍然对。activeOptions 不给（即默认的前缀
 * 判定）：前缀为真时人就在这一页上，aria-current="page" 是真话。
 */
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

/**
 * 平台一级侧栏的「节点」一项。
 * 它挂不挂由 platform-sidebar.tsx 的 PlatformNavGroup 按平台角色决定。
 */
import {
	SidebarMenuButton,
	SidebarMenuItem,
} from "@automationstack/ui/components/sidebar-menu";
import { Link } from "@tanstack/react-router";
import { HardDriveIcon } from "lucide-react";

/**
 * 实机节点。
 *
 * **按平台角色隐藏**，与「用户」「镜像库」两项同规。这一支比那两支还紧一档：
 * 六条过程全是 adminProcedure（其中两条会吐明文 token），非管理员在这一页上
 * 能画出来的全部内容就是一张「需要管理员权限」的空态——给这样一页留人人可见的
 * 入口，等于在导航里摆一扇必然撞墙的门。
 *
 * 藏入口不等于权限：地址栏拦不住任何人，farm-nodes-page.tsx 里那张 forbidden
 * 空态是必须留的兜底，真正拦人的是服务端的 adminProcedure。
 *
 * 图标取 HardDriveIcon（一台机器）：这一项指的是**真机**，而隔壁「镜像库」那项
 * 占的是 LayersIcon（层叠的镜像）——两项的差别正是「机器」与「机器要拉的东西」，
 * 图标要能一眼分出这一层。server 系被留给了别处的部署概念，monitor 系被项目内的
 * 「会话」占着，同一套隐喻不该分给两件事。
 *
 * 排在「镜像库」**之前**：节点是主体，能力清单在这一页（推导见 platform-sidebar.tsx）。
 * 按前缀判活动态，理由同另外两项：这一支目前没有更深的子页面，将来长出来了
 * 前缀写法也仍然对。
 */
export function FarmNodesNavItem({ pathname }: { pathname: string }) {
	return (
		<SidebarMenuItem>
			<SidebarMenuButton
				aria-label="节点"
				isActive={pathname.startsWith("/nodes")}
				render={<Link to="/nodes" />}
				tooltip="节点"
			>
				<HardDriveIcon aria-hidden="true" />
				<span>节点</span>
			</SidebarMenuButton>
		</SidebarMenuItem>
	);
}

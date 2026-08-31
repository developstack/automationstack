/**
 * 平台一级侧栏的「用户」一项，自 platform-sidebar.tsx 拆出。
 * 它挂不挂由那边的 PlatformNavGroup 按平台角色决定，理由见下。
 */
import {
	SidebarMenuButton,
	SidebarMenuItem,
} from "@automationstack/ui/components/sidebar-menu";
import { Link } from "@tanstack/react-router";
import { UsersIcon } from "lucide-react";

/**
 * 用户。
 *
 * 这一项**按平台角色隐藏**：非 admin 的侧栏里它根本不渲染（判定在
 * platform-sidebar.tsx 的 PlatformNavGroup）。这与 project-users-nav-item.tsx
 * 里「成员」那一项的决定正好相反，而那一段（「对所有项目成员可见，不按角色
 * 隐藏」）仍然是对的——两处结论相反，是因为两页背后的过程根本不是一回事。
 *
 * 项目内的成员页读 `projectMembers.list`，那一条对项目里的每个人开放。普通成员
 * 点进去拿到的是一份货真价实的只读名单：队友是谁、该找谁要权限，答案都写在页面
 * 上。入口留着，是因为它背后确实有东西可看；能不能**改**，交给页面里的操作控件
 * 回答。
 *
 * 平台用户页读 `users.listWithProjects`，那是 `adminProcedure`。非 admin 调它只
 * 会拿到 FORBIDDEN，这一页对他能画出来的全部内容就是一张「需要管理员权限」的空
 * 态。给这样一页留一个人人可见的入口，等于在导航里摆一扇必然撞墙的门：点进去、
 * 读一句「你不能看」、再退回来，全程没有一步是他做得成的。「交给页面里的控件
 * 回答」这条成立的前提是**页面本身有内容**；这一页对非 admin 连内容都没有，于是
 * 只能由入口本身回答。
 *
 * 藏掉入口不等于权限，这一点必须说死：地址栏拦不住任何人，手敲 /users 照样进得
 * 来。所以 platform-users-page.tsx 里那张 forbidden 空态是必须留的兜底，绝不能
 * 因为「入口已经藏了」就顺手删掉。真正拦人的是服务端的 adminProcedure，前后这
 * 两层都只是让被拦下的那一刻不至于是一张白页或一句原始的 FORBIDDEN。
 *
 * 按前缀算，理由同 project-settings-nav-item.tsx 的「设置」一项：这一支目前没有
 * 更深的子页面，将来长出来了前缀写法也仍然对。activeOptions 不给（即默认的前缀
 * 判定）：前缀为真时人就在这一页上，aria-current="page" 是真话。
 */
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

import {
	Sidebar,
	SidebarContent,
	SidebarGroup,
	SidebarRail,
} from "@automationstack/ui/components/sidebar";
import {
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
} from "@automationstack/ui/components/sidebar-menu";
import { Link, useRouterState } from "@tanstack/react-router";
import { FolderKanbanIcon, UsersIcon } from "lucide-react";

import { useSession } from "@/components/auth/use-session";
import { SidebarBrand } from "@/components/layout/sidebar-brand";
import { SidebarUser } from "@/components/layout/sidebar-user";

/**
 * 平台作用域的一级侧栏：品牌 + 平台导航 + 用户区。
 *
 * 这是继项目侧栏（project-sidebar.tsx）之后的第二条一级侧栏，两条各自管一个
 * 作用域：进项目之前是这一条，进项目之后换成那一条。品牌行与用户区共用
 * sidebar-brand.tsx / sidebar-user.tsx 的同一份——两栏在同一次会话里来回换，
 * 这两端但凡不是同一份，换栏时上下就会各跳一次（那段推导写在 project-sidebar.tsx）。
 *
 * 它取代了项目列表页原先的裸壳（components/layout/plain-shell.tsx，已随本次改动
 * 删除）。裸壳当初的论证是「选项目这一步还没有作用域可导航，侧栏里能放的只有它
 * 自己那一项」——那个前提在「平台」也成为一个作用域之后就不成立了：这一层现在有
 * 两个去处（项目、用户），一条真正的导航。顺带收回一笔债：裸壳没有 SidebarUser，
 * 只好在顶栏另写一份 PlainShellUserMenu 来安放登出与切主题，那份重复实现随文件
 * 一起消失，全站的账户出口重新收敛回 sidebar-user.tsx 一处。
 */

/** 只取 pathname：整个 location 拿来比较的话，search/hash 一变侧栏就白重画一次。 */
const selectPathname = (state: { location: { pathname: string } }) =>
	state.location.pathname;

function ProjectsNavItem({ pathname }: { pathname: string }) {
	return (
		<SidebarMenuItem>
			<SidebarMenuButton
				aria-label="项目"
				/*
				 * 按前缀算不会误伤：这条侧栏只在平台层的两页上出现，进了
				 * /projects/<id> 之后屏幕上换成的是 ProjectSidebar，这一行根本不在。
				 *
				 * activeOptions.exact 与 isActive 刻意不同步，理由与 project-nav-group
				 * 的「用例管理」一节相同：Link 默认按前缀判活动态，那会让项目内页面
				 * 也挂上 aria-current="page"，而那句播报是假的。视觉高亮走 isActive，
				 * 语义只在精确停在列表页时给。
				 */
				isActive={pathname.startsWith("/projects")}
				render={<Link activeOptions={{ exact: true }} to="/projects" />}
				tooltip="项目"
			>
				<FolderKanbanIcon aria-hidden="true" />
				<span>项目</span>
			</SidebarMenuButton>
		</SidebarMenuItem>
	);
}

/**
 * 用户。
 *
 * 这一项**按平台角色隐藏**：非 admin 的侧栏里它根本不渲染（判定在下面的
 * PlatformNavGroup）。这与 project-nav-group.tsx 里「成员」那一项的决定正好
 * 相反，而那一段（「对所有项目成员可见，不按角色隐藏」）仍然是对的——两处结论
 * 相反，是因为两页背后的过程根本不是一回事。
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
 * 按前缀算，理由同 project-nav-group 的「设置」一项：这一支目前没有更深的子页面
 * ，将来长出来了前缀写法也仍然对。activeOptions 不给（即默认的前缀判定）：前缀
 * 为真时人就在这一页上，aria-current="page" 是真话。
 */
function PlatformUsersNavItem({ pathname }: { pathname: string }) {
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

/**
 * 平台层的一级去处。
 *
 * 不加组标题：全组最多两项，再没有第二组要跟它区分，标题除了占掉一行什么也没说
 * （与 ProjectNavGroup 同一条约定）。
 *
 * 会话还在路上（`isPending`）时按「不是 admin」渲染，也就是先不画「用户」那一行
 * ：反过来先画、拿到会话再撤掉，普通成员会看见一行一闪而过的入口，比晚一拍出现
 * 更糟。admin 那一拍的代价只是这一行稍晚落位，而它下面就是用户区，不会把已经读
 * 到的内容顶走。
 */
function PlatformNavGroup() {
	const pathname = useRouterState({ select: selectPathname });
	const { user } = useSession();

	return (
		<SidebarGroup>
			<SidebarMenu>
				<ProjectsNavItem pathname={pathname} />
				{user?.role === "admin" ? (
					<PlatformUsersNavItem pathname={pathname} />
				) : null}
			</SidebarMenu>
		</SidebarGroup>
	);
}

/** 平台作用域的一级侧栏。整份文件的推导见顶部。 */
export function PlatformSidebar() {
	return (
		// collapsible 用默认的 "icon"：收起后缩成图标轨，而不是整块滑出屏幕
		<Sidebar>
			<SidebarBrand />
			<SidebarContent>
				<PlatformNavGroup />
			</SidebarContent>
			<SidebarUser />
			{/* 面板右缘的细条：鼠标已经在侧边栏这一侧时，比回到品牌行更近 */}
			<SidebarRail />
		</Sidebar>
	);
}

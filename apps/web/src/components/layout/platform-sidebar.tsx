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
import { FolderKanbanIcon } from "lucide-react";

import { useSession } from "@/components/auth/use-session";
import { FarmBrowsersNavItem } from "@/components/layout/farm-browsers-nav-item";
import { FarmNodesNavItem } from "@/components/layout/farm-nodes-nav-item";
import { PlatformUsersNavItem } from "@/components/layout/platform-users-nav-item";
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
 * 平台层的一级去处。
 *
 * 不加组标题：全组最多四项，再没有第二组要跟它区分，标题除了占掉一行什么也没说
 * （与 ProjectNavGroup 同一条约定）。
 *
 * 会话还在路上（`isPending`）时按「不是 admin」渲染，也就是先不画「用户」「节点」
 * 「镜像库」那三行：反过来先画、拿到会话再撤掉，普通成员会看见一闪而过的入口，比晚一拍出现
 * 更糟。admin 那一拍的代价只是这三行稍晚落位，而它们下面就是用户区，不会把已经读
 * 到的内容顶走。三项同进同出，共用一个 admin 判定的 Fragment。
 */
function PlatformNavGroup() {
	const pathname = useRouterState({ select: selectPathname });
	const { user } = useSession();

	return (
		<SidebarGroup>
			<SidebarMenu>
				<ProjectsNavItem pathname={pathname} />
				{user?.role === "admin" ? (
					<>
						<PlatformUsersNavItem pathname={pathname} />
						{/*
						 * 节点排在镜像库**之前**（plan §12 的模型转向）：主体是机器，
						 * 「这台机器上有哪些浏览器」由它自己探出来上报，镜像库降格成
						 * docker 后端拉镜像时查的那本目录。排在前面的那一项是这一层的
						 * 主入口，顺序说反了，人会先去目录里找一个根本不在那儿的答案。
						 */}
						<FarmNodesNavItem pathname={pathname} />
						<FarmBrowsersNavItem pathname={pathname} />
					</>
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

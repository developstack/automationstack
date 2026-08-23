import {
	Sidebar,
	SidebarContent,
	SidebarGroup,
	SidebarHeader,
	SidebarRail,
} from "@automationstack/ui/components/sidebar";
import { useSidebar } from "@automationstack/ui/components/sidebar-context";
import {
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
} from "@automationstack/ui/components/sidebar-menu";
import { Link, useRouterState } from "@tanstack/react-router";
import {
	BotIcon,
	FlaskConicalIcon,
	FolderKanbanIcon,
	PanelLeftCloseIcon,
	PanelLeftOpenIcon,
	UsersIcon,
} from "lucide-react";

import { useCurrentUser } from "@/components/auth/use-session";
import { SidebarUser } from "@/components/layout/sidebar-user";

const BRAND_NAME = "测试用例平台";

const PROJECTS_PATH = "/projects";
const MEMBERS_PATH = "/members";
const AI_PROVIDER_PATH = "/ai-provider";

/**
 * 品牌行本身就是收起开关。
 *
 * 收起后侧边栏不再滑走，而是留下一条 3rem 的图标轨，品牌行始终可见，
 * 于是它就是最近的那个开关——宽屏顶栏因此不必再放一颗重复的。
 * 静止时显示 logo，悬停才原地换成方向图标：不打扰阅读，指上去才暴露可点。
 * 它不再链去 /projects——「项目管理」这一项就在下面，出口没有丢。
 */
function SidebarBrandButton() {
	const { isCompact, state, toggleSidebar } = useSidebar();
	// 窄屏抽屉里 state 仍是宽屏那份收起状态，只看它会在抽屉里画出反向的图标
	const collapsed = state === "collapsed" && !isCompact;
	const ToggleIcon = collapsed ? PanelLeftOpenIcon : PanelLeftCloseIcon;
	return (
		<SidebarMenuButton
			// 收起态文字被原语藏了，可访问名只剩它；文案随状态走，读屏才知道按下去会发生什么
			aria-label={collapsed ? "展开侧边栏" : "收起侧边栏"}
			// 图标轨里整行被压成 32px 见方且 padding 归零，不居中的话图标会贴着左边缘
			className="group/logo group-data-[collapsible=icon]:justify-center"
			onClick={toggleSidebar}
			size="lg"
			// 收起态才弹，展开态与窄屏抽屉由原语自己关掉
			tooltip={BRAND_NAME}
		>
			{/* 两枚图标叠在同一个格子里交叉淡入淡出，行内不会因为换图标而位移 */}
			<span className="relative flex size-4 shrink-0 items-center justify-center">
				<FlaskConicalIcon
					aria-hidden="true"
					className="transition-opacity ease-emphasized group-hover/logo:opacity-0"
				/>
				<ToggleIcon
					aria-hidden="true"
					className="absolute opacity-0 transition-opacity ease-emphasized group-hover/logo:opacity-100"
				/>
			</span>
			{/* 末位的 span 就是原语在图标轨里负责藏起来的那个文字标签 */}
			<span className="truncate font-medium text-sm">{BRAND_NAME}</span>
		</SidebarMenuButton>
	);
}

function SidebarBrand() {
	return (
		<SidebarHeader>
			<SidebarMenu>
				<SidebarMenuItem>
					<SidebarBrandButton />
				</SidebarMenuItem>
			</SidebarMenu>
		</SidebarHeader>
	);
}

/** 只取 pathname：整个 location 拿来比较的话，search/hash 一变侧栏就白重画一次。 */
const selectPathname = (state: { location: { pathname: string } }) =>
	state.location.pathname;

/*
 * 「项目管理」的选中态必须精确匹配：/projects 是 /projects/<id> 的前缀，
 * 按前缀算的话待在某个项目里时它会一直亮着，而它恰恰是「离开当前项目」的出口，
 * 高亮反而在说「你就在项目列表页」。尾斜杠是同一个地址，一并算上。
 */
const isProjectsRoot = (pathname: string) =>
	pathname === PROJECTS_PATH || pathname === `${PROJECTS_PATH}/`;

/**
 * 这一层唯一的导航组：全站的一级去处（管理员比成员多出两个管理入口）。
 *
 * 不加组标题——全组至多三项，且再没有第二组要跟它区分，标题除了占掉一行
 * 什么也没说。也不 mt-auto 顶到底部：那种排法是给「上面还有一组视图入口」
 * 准备的，如今它紧接品牌行，再钉到底部只会让上半截空出一大片。
 */
function GlobalNavGroup() {
	const user = useCurrentUser();
	const pathname = useRouterState({ select: selectPathname });
	return (
		<SidebarGroup>
			<SidebarMenu>
				<SidebarMenuItem>
					<SidebarMenuButton
						aria-label="项目管理"
						isActive={isProjectsRoot(pathname)}
						/*
						 * activeOptions.exact 不能省：Link 默认按前缀判定活动态，
						 * 而 /projects 是 /projects/<id> 的前缀，于是待在某个项目里时
						 * 它会给自己挂上 aria-current="page"，读屏据此播报「当前页」——
						 * 可这一项恰恰是「离开当前项目」的出口，视觉上也没有任何高亮。
						 */
						render={<Link activeOptions={{ exact: true }} to="/projects" />}
						tooltip="项目管理"
					>
						<FolderKanbanIcon aria-hidden="true" />
						<span>项目管理</span>
					</SidebarMenuButton>
				</SidebarMenuItem>
				{/* 只对管理员出现：非管理员点进去只会拿到 FORBIDDEN */}
				{user.role === "admin" ? (
					<SidebarMenuItem>
						<SidebarMenuButton
							aria-label="成员管理"
							// 这一项可以按前缀算：/members 底下若再长出子路由，人仍然在成员管理里
							isActive={pathname.startsWith(MEMBERS_PATH)}
							render={<Link to="/members" />}
							tooltip="成员管理"
						>
							<UsersIcon aria-hidden="true" />
							<span>成员管理</span>
						</SidebarMenuButton>
					</SidebarMenuItem>
				) : null}
				{/* 同样只对管理员出现：AI 配置那几个过程都是 adminProcedure */}
				{user.role === "admin" ? (
					<SidebarMenuItem>
						<SidebarMenuButton
							aria-label="AI 配置"
							// 同样可以按前缀算：这一项底下若再长出子路由，人仍然在 AI 配置里
							isActive={pathname.startsWith(AI_PROVIDER_PATH)}
							render={<Link to="/ai-provider" />}
							tooltip="AI 配置"
						>
							<BotIcon aria-hidden="true" />
							<span>AI 配置</span>
						</SidebarMenuButton>
					</SidebarMenuItem>
				) : null}
			</SidebarMenu>
		</SidebarGroup>
	);
}

/**
 * 全站一级侧栏：品牌 + 全局导航 + 用户区。
 *
 * 只承担「在哪几个一级去处之间走动」这一件事，所以整个组件不需要 projectId。
 * 项目内部的事——视图切换（列表 / 脑图）与模块导航——全在二级面板里：
 * 那两者都跟着选中的模块走，放在一级侧栏就得把模块作用域再往上传一层。
 */
export function AppSidebar() {
	return (
		// collapsible 用默认的 "icon"：收起后缩成图标轨，而不是整块滑出屏幕
		<Sidebar>
			<SidebarBrand />
			<SidebarContent>
				<GlobalNavGroup />
			</SidebarContent>
			<SidebarUser />
			{/* 面板右缘的细条：鼠标已经在侧边栏这一侧时，比回到品牌行更近 */}
			<SidebarRail />
		</Sidebar>
	);
}

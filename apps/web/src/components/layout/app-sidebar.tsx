import {
	Sidebar,
	SidebarContent,
	SidebarGroup,
	SidebarHeader,
	SidebarRail,
	SidebarTrigger,
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
 * 展开态的品牌行：左边是标识，右边是那颗常驻的收起按钮。
 *
 * 标识这块不再是开关。整行可点、且只在悬停时才把 logo 换成方向图标，等于把
 * 「这里可以收起」藏进了必须先碰一下才看得见的状态里；拆出一颗独立的
 * SidebarTrigger 之后，入口静止时就摆在那儿，不必先猜。
 *
 * size 显式写 icon 而不是省略：Button 的 icon 档现在本身就是 32px（见
 * packages/ui/src/components/button.tsx 顶部的台阶说明），与下面每一行导航
 * （sidebar-menu.tsx 的 h-8）等高，不必再拿更小的档去覆盖。留着这个 prop 只为
 * 让这颗按钮的档位在调用点上一眼可读——它旁边的 className 写着 size-8，
 * 两者说的是同一件事，谁也别单独改。
 */
function SidebarBrandRow() {
	return (
		// 收起态交给下面那颗品牌格：图标轨只有 32px 宽，塞不下第二个可点目标
		<div className="flex items-center gap-1 group-data-[collapsible=icon]:hidden">
			{/* min-w-0 不能省：flex 子项的 min-width 默认是 auto，truncate 在里面不生效 */}
			<div className="flex min-w-0 flex-1 items-center gap-2 px-2">
				<FlaskConicalIcon aria-hidden="true" className="size-4 shrink-0" />
				<span className="truncate font-medium text-sm">{BRAND_NAME}</span>
			</div>
			<SidebarTrigger className="size-8 shrink-0" size="icon" />
		</div>
	);
}

/**
 * 收起态（图标轨）的品牌格：格子本身就是展开开关。
 *
 * 轨里只有 32px，放不下「标识 + 按钮」两个目标，所以这一态仍旧沿用整格可点的做法。
 * 静止是 logo、悬停才换成方向图标：轨里没有文字可读，图标是唯一的落点，
 * 两枚常驻只会互相打架。
 */
function SidebarBrandToggle() {
	const { toggleSidebar } = useSidebar();
	return (
		<SidebarMenuButton
			// 轨里文字被原语藏了，可访问名只剩它；这一格只在收起态露面，文案不必随状态变
			aria-label="展开侧边栏"
			// hidden 打底、命中收起态才 flex：用显隐而不是条件渲染，收起动画补间到一半时
			// 节点若被整个换掉会闪一下，而宽度补间（transition-sidebar-offset / -gap）
			// 全程要求这棵子树不 remount
			className="group/logo hidden group-data-[collapsible=icon]:flex group-data-[collapsible=icon]:justify-center"
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
				<PanelLeftOpenIcon
					aria-hidden="true"
					className="absolute opacity-0 transition-opacity ease-emphasized group-hover/logo:opacity-100"
				/>
			</span>
			{/* 这个 span 在轨里永远看不见，但删不得：原语藏的是「末位的 span」，
			    它一走，上面那枚图标就顶上末位、跟着被藏掉 */}
			<span className="truncate font-medium text-sm">{BRAND_NAME}</span>
		</SidebarMenuButton>
	);
}

/**
 * 品牌区。两种形态同时挂在树上，靠 CSS 显隐二选一。
 *
 * 窄屏抽屉走的是 SidebarDrawer 分支，外层没有 data-collapsible，
 * group-data-[collapsible=icon]:* 一族全不命中，于是抽屉里显示的是展开态那一行——
 * 里面那颗 SidebarTrigger 在窄屏切的是 openMobile，也就是关掉抽屉，
 * 正好补上 SheetContent 关掉的那颗关闭按钮。
 */
function SidebarBrand() {
	return (
		<SidebarHeader>
			<SidebarMenu>
				<SidebarMenuItem>
					<SidebarBrandRow />
					<SidebarBrandToggle />
				</SidebarMenuItem>
			</SidebarMenu>
		</SidebarHeader>
	);
}

/** 只取 pathname：整个 location 拿来比较的话，search/hash 一变侧栏就白重画一次。 */
const selectPathname = (state: { location: { pathname: string } }) =>
	state.location.pathname;

/*
 * 「项目管理」按前缀算，进到 /projects/<id> 里面之后也保持高亮。
 *
 * 这里曾经要求精确匹配，理由是「它恰恰是离开当前项目的出口，高亮会让人以为
 * 自己在项目列表页」。那条论证把两件事混成了一件：待在 /projects/<id>/cases 时,
 * 「我在项目这一块」为真，「我在项目列表页」为假——前者是视觉高亮该说的,
 * 后者是 aria-current="page" 该说的。精确匹配同时关掉了两者，代价是一级侧栏
 * 在整个项目内部全程无高亮，看着像高亮「跳」进了二级面板。
 *
 * 两个通道在这个组件里本来就是两个 prop：isActive 走 data-active（纯视觉），
 * Link 的 activeOptions 走 aria-current（读屏语义）。所以分开给：
 * 视觉按前缀亮，aria-current="page" 仍旧只在精确匹配时出现。
 *
 * 两栏回答的是不同的问题——一级说「在应用的哪一块」，二级说「在项目的哪个模块 /
 * 哪个视图」——它们是正交的，本就该同时亮着。
 */
const isInProjectsSection = (pathname: string) =>
	pathname.startsWith(PROJECTS_PATH);

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
						isActive={isInProjectsSection(pathname)}
						/*
						 * activeOptions.exact 不能省，而且它与上面的 isActive 刻意不同步：
						 * Link 默认按前缀判定活动态，于是待在某个项目里时它会挂上
						 * aria-current="page"，读屏据此播报「当前页」——可那时人在项目
						 * 内部，不在项目列表页，这句播报是假的。视觉高亮按前缀（见
						 * isInProjectsSection 的注释），语义只在精确匹配时给。
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

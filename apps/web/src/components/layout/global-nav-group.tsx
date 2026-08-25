import { SidebarGroup } from "@automationstack/ui/components/sidebar";
import {
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
} from "@automationstack/ui/components/sidebar-menu";
import { Link, useRouterState } from "@tanstack/react-router";
import {
	BotIcon,
	FolderKanbanIcon,
	KeyRoundIcon,
	SettingsIcon,
	UsersIcon,
} from "lucide-react";

import { useCurrentUser } from "@/components/auth/use-session";

/**
 * 一级侧栏里唯一的导航组，以及组成它的那几项。
 *
 * 每一项单独一个组件而不是由一份数组渲染：`to` 在 TanStack Router 里是**按路由
 * 树校验过的字面量**，塞进数组就只能退化成 string，整棵路由树的类型保护当场作废；
 * 而且这几项各自带着不同的活动态判定与理由（见下），共性只有「一个图标加一行字」。
 *
 * `pathname` 由组一次性订阅、再逐项传下去，不让每项各自调 `useRouterState`：
 * 一次订阅换成五次，路由一变就是五次各自独立的重渲染，而它们本来就该一起变。
 */

/** 只取 pathname：整个 location 拿来比较的话，search/hash 一变侧栏就白重画一次。 */
const selectPathname = (state: { location: { pathname: string } }) =>
	state.location.pathname;

const PROJECTS_PATH = "/projects";
const MEMBERS_PATH = "/members";
const AI_PROVIDER_PATH = "/ai-provider";
const API_TOKENS_PATH = "/api-tokens";
const SETTINGS_PATH = "/settings";

interface NavItemProps {
	pathname: string;
}

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

function ProjectsNavItem({ pathname }: NavItemProps) {
	return (
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
	);
}

function MembersNavItem({ pathname }: NavItemProps) {
	return (
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
	);
}

function AiProviderNavItem({ pathname }: NavItemProps) {
	return (
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
	);
}

function SettingsNavItem({ pathname }: NavItemProps) {
	return (
		<SidebarMenuItem>
			<SidebarMenuButton
				aria-label="设置"
				// 按前缀算：这一项底下若再长出子路由，人仍然在设置里
				isActive={pathname.startsWith(SETTINGS_PATH)}
				render={<Link to="/settings" />}
				tooltip="设置"
			>
				<SettingsIcon aria-hidden="true" />
				<span>设置</span>
			</SidebarMenuButton>
		</SidebarMenuItem>
	);
}

function ApiTokensNavItem({ pathname }: NavItemProps) {
	return (
		<SidebarMenuItem>
			<SidebarMenuButton
				aria-label="API Token"
				// 按前缀算：这一项底下若再长出子路由，人仍然在 Token 管理里
				isActive={pathname.startsWith(API_TOKENS_PATH)}
				render={<Link to="/api-tokens" />}
				tooltip="API Token"
			>
				<KeyRoundIcon aria-hidden="true" />
				<span>API Token</span>
			</SidebarMenuButton>
		</SidebarMenuItem>
	);
}

/**
 * 这一层唯一的导航组：全站的一级去处（管理员比成员多出两个管理入口）。
 *
 * 不加组标题——全组至多五项，且再没有第二组要跟它区分，标题除了占掉一行
 * 什么也没说。也不 mt-auto 顶到底部：那种排法是给「上面还有一组视图入口」
 * 准备的，如今它紧接品牌行，再钉到底部只会让上半截空出一大片。
 */
export function GlobalNavGroup() {
	const user = useCurrentUser();
	const pathname = useRouterState({ select: selectPathname });
	const isAdmin = user.role === "admin";
	return (
		<SidebarGroup>
			<SidebarMenu>
				<ProjectsNavItem pathname={pathname} />
				{/* 只对管理员出现：非管理员点进去只会拿到 FORBIDDEN */}
				{isAdmin ? <MembersNavItem pathname={pathname} /> : null}
				{/* 同样只对管理员出现：AI 配置那几个过程都是 adminProcedure */}
				{isAdmin ? <AiProviderNavItem pathname={pathname} /> : null}
				{/*
				 * 不按角色收起：projectSettings 与 jira 那几个过程都是
				 * protectedProcedure（不是 adminProcedure），普通成员点进去拿得到
				 * 数据也存得下去，藏起来反而是前端擅自加了一道后端没有的权限。
				 */}
				<SettingsNavItem pathname={pathname} />
				{/*
				 * 同样不按角色收起，理由与上面那条一字不差：apiTokens 的三个过程
				 * 都是 protectedProcedure。而且这一页比「设置」更不能藏——token 是
				 * **个人**凭据，每个人只管得到自己那几枚，藏起来等于普通成员永远
				 * 接不上 CI。
				 *
				 * 紧挨着「设置」摆：两者都不是日常干活的去处，是「配一次就走」的
				 * 那一类，放一块儿人找的时候只需要认一个区域。
				 */}
				<ApiTokensNavItem pathname={pathname} />
			</SidebarMenu>
		</SidebarGroup>
	);
}

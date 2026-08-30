import { SidebarGroup } from "@automationstack/ui/components/sidebar";
import {
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
} from "@automationstack/ui/components/sidebar-menu";
import { Link, useRouterState } from "@tanstack/react-router";
import {
	ClipboardListIcon,
	LayoutDashboardIcon,
	ListChecksIcon,
	SettingsIcon,
} from "lucide-react";

import { isCaseSectionPathname } from "@/components/layout/case-section-path";

/**
 * 项目内一级侧栏的导航组，以及组成它的那几项。
 *
 * 每一项单独一个组件而不是由一份数组渲染，
 * 因为 `to` 在 TanStack Router 里是**按路由树校验过的字面量**，塞进数组就只能
 * 退化成 string，整棵路由树的类型保护当场作废；而且这几项各自带着不同的活动态
 * 判定与理由（见下），共性只有「一个图标加一行字」。
 *
 * `pathname` 由组一次性订阅、再逐项传下去，不让每项各自调 `useRouterState`：
 * 一次订阅换成四次，路由一变就是四次各自独立的重渲染，而它们本来就该一起变。
 */

/** 只取 pathname：整个 location 拿来比较的话，search/hash 一变侧栏就白重画一次。 */
const selectPathname = (state: { location: { pathname: string } }) =>
	state.location.pathname;

interface NavItemProps {
	pathname: string;
	projectId: string;
}

function OverviewNavItem({ pathname, projectId }: NavItemProps) {
	return (
		<SidebarMenuItem>
			<SidebarMenuButton
				aria-label="项目概览"
				// 按前缀算：概览底下若再长出子路由，人仍然在概览这一支里
				isActive={pathname.startsWith(`/projects/${projectId}/overview`)}
				render={
					<Link params={{ projectId }} to="/projects/$projectId/overview" />
				}
				tooltip="项目概览"
			>
				<LayoutDashboardIcon aria-hidden="true" />
				<span>项目概览</span>
			</SidebarMenuButton>
		</SidebarMenuItem>
	);
}

/*
 * 「用例管理」的去处是项目根路径本身，而其余三项都长在它下面，所以这一项**不能**
 * 按前缀算——前缀匹配会让四项在任何项目内页面上同时高亮。判据单独抽在
 * case-section-path.ts 里（项目根路径，或脑图页），二级模块面板也用同一份。
 *
 * activeOptions.exact 不能省，而且它与 isActive 刻意不同步：Link 默认按前缀判定活动态，
 * 于是待在 /overview、/test-runs 里时它会挂上 aria-current="page"，读屏据此播报
 * 「当前页」——那句播报是假的。视觉高亮走 isActive（纯视觉，按本段的判据），
 * 语义只在精确匹配时给。代价是脑图页视觉亮着而没有 aria-current，这是对的：
 * 「我在用例管理这一块」为真，「我在用例列表页」为假。
 */
function CasesNavItem({ pathname, projectId }: NavItemProps) {
	return (
		<SidebarMenuItem>
			<SidebarMenuButton
				aria-label="用例管理"
				isActive={isCaseSectionPathname(pathname, projectId)}
				render={
					<Link
						activeOptions={{ exact: true }}
						params={{ projectId }}
						to="/projects/$projectId"
					/>
				}
				tooltip="用例管理"
			>
				<ListChecksIcon aria-hidden="true" />
				<span>用例管理</span>
			</SidebarMenuButton>
		</SidebarMenuItem>
	);
}

function TestRunsNavItem({ pathname, projectId }: NavItemProps) {
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
function ProjectSettingsNavItem({ pathname, projectId }: NavItemProps) {
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

interface ProjectNavGroupProps {
	projectId: string;
}

/**
 * 项目内的一级去处。
 *
 * 不加组标题、也不 mt-auto 顶到底部：全组只有四项，再没有第二组要跟它区分，
 * 标题除了占掉一行什么也没说。
 *
 * 顺序按「先看状况、再干活、再看这一轮在测什么、最后是配一次就走的设置」排：
 * 概览是进项目后的第一个问题，用例管理是每天的落脚点，测试任务是用例库的消费方。
 */
export function ProjectNavGroup({ projectId }: ProjectNavGroupProps) {
	const pathname = useRouterState({ select: selectPathname });
	return (
		<SidebarGroup>
			<SidebarMenu>
				<OverviewNavItem pathname={pathname} projectId={projectId} />
				<CasesNavItem pathname={pathname} projectId={projectId} />
				<TestRunsNavItem pathname={pathname} projectId={projectId} />
				<ProjectSettingsNavItem pathname={pathname} projectId={projectId} />
			</SidebarMenu>
		</SidebarGroup>
	);
}

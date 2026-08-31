import { SidebarInset } from "@automationstack/ui/components/sidebar";
import { SidebarProvider } from "@automationstack/ui/components/sidebar-context";
import type { ReactNode } from "react";

import { readSidebarDefaultOpen } from "@/components/layout/sidebar-state";

interface AppShellProps {
	children: ReactNode;
	/**
	 * 要渲染的一级侧栏。必填。
	 *
	 * 曾经可以省略、由这一层兜底渲染全局侧栏，那是给 /settings 等四个顶级路由用的；
	 * 那四条路由已经并进 /projects/<id>/settings，全局侧栏连同兜底一起删了。留着
	 * 一个永远不会走到的默认值，只会让人以为还存在「不属于任何作用域的带侧栏页面」。
	 *
	 * 仍然做成 prop 而不是写死 ProjectSidebar：这一层管的是外壳本身（展开位、满屏
	 * 高度、主内容的滚动容器），不该知道侧栏里装的是项目还是别的什么；下一个作用域
	 * 冒出来时接的是同一个 prop，而不是在这里加一路分支。
	 */
	sidebar: ReactNode;
}

/**
 * 登录闸门之后带侧栏页面的外壳：一级侧栏 + 自己滚动的主内容。
 *
 * 两个作用域走这一层：项目页传入项目侧栏、并在此之上再套二级面板（见
 * project-shell.tsx）；平台层的 /projects 与 /users 传入 PlatformSidebar。
 * 项目列表页曾经不用这一层（那时平台层只有它一页，侧栏里放不下第二项，理由写在
 * 已删除的 plain-shell.tsx 里），/users 出现之后那个前提不再成立，它也搬了进来。
 * 登录页仍然不套——它本来就是一张自带满屏布局的页面，
 * 而且那时还没有用户，侧栏底部的用户区会直接抛。
 */
export function AppShell({ children, sidebar }: AppShellProps) {
	return (
		<SidebarProvider defaultOpen={readSidebarDefaultOpen()}>
			{sidebar}
			{/*
			 * h-svh 得在这里给：__root 不再统一派发高度，不撑满视口的话内容一长
			 * 就变成整页滚动，sticky 的顶栏会跟着被推出视野。SidebarProvider 自带的
			 * min-h-svh 不够——那只保证不小于视口，管不住超出的部分。
			 * SidebarInset 本身是 flex-col + min-h-0，子层的 flex-1 overflow-y-auto
			 * 因此滚得动。
			 */}
			<SidebarInset className="h-svh">{children}</SidebarInset>
		</SidebarProvider>
	);
}

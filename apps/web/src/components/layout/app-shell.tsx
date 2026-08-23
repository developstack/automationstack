import {
	SidebarInset,
	SidebarTrigger,
} from "@automationstack/ui/components/sidebar";
import { SidebarProvider } from "@automationstack/ui/components/sidebar-context";
import type { ReactNode } from "react";

import { AppSidebar } from "@/components/layout/app-sidebar";
import { readSidebarDefaultOpen } from "@/components/layout/sidebar-state";

interface AppShellProps {
	children: ReactNode;
}

/**
 * 登录闸门之后所有页面的外壳：一级侧栏 + 自己滚动的主内容。
 *
 * 项目页在此之上再套二级面板（见 project-shell.tsx），项目列表与成员管理
 * 直接用这一层。登录页不套——它本来就是一张自带满屏布局的页面，
 * 而且那时还没有用户，侧栏底部的用户区会直接抛。
 */
export function AppShell({ children }: AppShellProps) {
	return (
		<SidebarProvider defaultOpen={readSidebarDefaultOpen()}>
			<AppSidebar />
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

interface AppHeaderProps {
	children?: ReactNode;
}

/**
 * 全站顶栏。
 *
 * sticky + 不透明底色 + 下边框：主内容是自己滚的，顶栏不粘住的话
 * 内容会从它底下穿过去，滚一屏就分不清哪行属于顶栏、哪行属于内容。
 * 各页专属的内容（面包屑、presence、页名）由调用方塞进 children，
 * 外观只此一份，页与页之间来回切时顶栏不会跳。
 */
export function AppHeader({ children }: AppHeaderProps) {
	return (
		/*
		 * px-4 = 工作区 gutter 16px（约定见 components/workspace/module-tree.tsx 顶部）；
		 * backdrop-blur 配半透明底色：滚动的内容在顶栏下方化开，而不是硬生生被切断。
		 *
		 * 高度用 min-h-12 而不是 h-12：宽屏下这一行最高的是 36px 的图标按钮
		 * （SidebarTrigger 与 SecondaryPanelTrigger 都是 Button size="icon" = size-9），
		 * 配 py-1 与 border-b 只有 4 + 36 + 4 + 1 = 45px，够不到 48px，于是由 min-h-12
		 * 兜到 48px。box-sizing 是 border-box，这 48px 含最后那条 1px 下边框，正好与二级
		 * 面板标题行的 min-h-12（同为 48px、无 py 无边框）落在同一条底边上，
		 * 见 packages/ui/src/components/secondary-panel.tsx 的标题行。
		 * py 不能是 2：8 + 36 + 8 + 1 = 53px 会顶穿 min-h-12，顶栏就比面板标题行多出 5px。
		 * 写死 h-12 同样不行：390px 上面包屑和头像挤不下会各自换行，写死高度只会让
		 * 它们从 48px 的框里溢出去、压在边框上。flex-wrap + gap-y-2 让它们规规矩矩
		 * 换到第二行，py-1 到那时才真正吃上，顶栏跟着长高。
		 */
		<header className="sticky top-0 z-30 flex min-h-12 shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b bg-background/95 px-4 py-1 backdrop-blur">
			{/*
			 * 一级侧栏的开关只留给窄屏（断点与 hooks/use-compact-viewport.ts 的 1024px
			 * 一致）：宽屏的开关已经在侧栏的品牌行和右缘细条上，顶栏再放一颗就是第三个
			 * 同义按钮；而窄屏的侧栏是整块滑走的抽屉，没有它就再也叫不回来。
			 */}
			<SidebarTrigger className="lg:hidden" />
			{children}
		</header>
	);
}

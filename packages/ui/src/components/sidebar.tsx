"use client";

import { Button } from "@automationstack/ui/components/button";
import { Separator } from "@automationstack/ui/components/separator";
import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
} from "@automationstack/ui/components/sheet";
import {
	SIDEBAR_WIDTH_MOBILE,
	useSidebar,
} from "@automationstack/ui/components/sidebar-context";
import { cn } from "@automationstack/ui/lib/utils";
import { PanelLeftIcon } from "lucide-react";
import type { ComponentProps, CSSProperties } from "react";
import { useCallback } from "react";

/** 收起方式：`icon` 留一条图标轨，`offcanvas` 整块滑出视口。 */
type SidebarCollapsible = "icon" | "offcanvas";

export interface SidebarProps extends ComponentProps<"div"> {
	/**
	 * 收起时的形态，默认 `icon`：导航入口在收起后仍然看得见、点得到，
	 * 少了「先展开、再找、再点」这一步。整块滑走留给确实要把屏幕让干净的场景。
	 */
	collapsible?: SidebarCollapsible;
}

/**
 * 侧边栏外壳。宽屏是一块定宽的固定面，窄屏（< lg）改由抽屉承载——
 * 断点与 hooks/use-compact-viewport.ts 里的 1024px 是同一条线。
 */
export function Sidebar({
	children,
	className,
	collapsible = "icon",
}: SidebarProps) {
	const { isCompact } = useSidebar();
	// 抽屉只有开 / 关两态，没有「收起成什么样」的问题，collapsible 到这里就不再往下传
	if (isCompact) {
		return <SidebarDrawer className={className}>{children}</SidebarDrawer>;
	}
	return (
		<SidebarPanel className={className} collapsible={collapsible}>
			{children}
		</SidebarPanel>
	);
}

function SidebarDrawer({ children, className }: ComponentProps<"div">) {
	const { openMobile, setOpenMobile } = useSidebar();
	return (
		<Sheet onOpenChange={setOpenMobile} open={openMobile}>
			<SheetContent
				className={cn(
					"w-(--sidebar-width) bg-sidebar text-sidebar-foreground",
					className
				)}
				showCloseButton={false}
				side="left"
				style={{ "--sidebar-width": SIDEBAR_WIDTH_MOBILE } as CSSProperties}
			>
				{/* 抽屉必须有可访问名；标题本身由侧边栏内的品牌区承担，这里只给读屏 */}
				<SheetHeader className="sr-only">
					<SheetTitle>导航</SheetTitle>
				</SheetHeader>
				<div className="flex min-h-0 w-full flex-1 flex-col">{children}</div>
			</SheetContent>
		</Sheet>
	);
}

/**
 * 宽屏的固定面。
 *
 * 两层结构：外层 `sidebar-gap` 在正常流里占位并随收起补间宽度，
 * 内层是 `fixed` 的实体面。二者分开，收起时主内容才会平滑地补上空间，
 * 而不是等面板变形后突然跳一格。
 */
function SidebarPanel({
	children,
	className,
	collapsible,
}: SidebarProps & { collapsible: SidebarCollapsible }) {
	const { state } = useSidebar();
	return (
		<div
			/*
			 * 展开时 data-collapsible 故意是空串而不是 collapsible 本身：
			 * 所有 group-data-[collapsible=icon]/[collapsible=offcanvas] 变体因此天然只在
			 * 收起态命中，子元素不必再叠一层 group-data-[state=collapsed] 去限定。
			 * 这是 shadcn 的惯用法，也是各处 icon 模式样式能写得这么短的原因。
			 */
			className="group peer hidden text-sidebar-foreground lg:block"
			data-collapsible={state === "collapsed" ? collapsible : ""}
			data-slot="sidebar"
			data-state={state}
		>
			<div
				className="relative w-(--sidebar-width) bg-transparent transition-sidebar-gap group-data-[collapsible=icon]:w-(--sidebar-width-icon) group-data-[collapsible=offcanvas]:w-0"
				data-slot="sidebar-gap"
			/>
			<div
				className={cn(
					// icon 模式只收窄不位移：面板要留在原地当图标轨，left 位移是 offcanvas 专有的滑出
					//
					// 右边框划「一级侧栏 | 二级面板」这条界：两块同为 bg-sidebar，色阶差是 0，
					// 除了画线没有别的分界手段，去掉两块就焊成一整块；没有二级面板的页面
					// （/projects、/members）里它转而当导航面与内容面的边界，两种布局都成立。
					// 不挪面色造色阶差：一二级选中底色都吃 --sidebar-accent，动面色会腰斩其对比度。
					"fixed inset-y-0 left-0 z-10 hidden h-svh w-(--sidebar-width) border-sidebar-border border-r transition-sidebar-offset group-data-[collapsible=offcanvas]:left-(--sidebar-width-negative) group-data-[collapsible=icon]:w-(--sidebar-width-icon) lg:flex",
					className
				)}
				data-slot="sidebar-container"
			>
				<div className="flex size-full min-h-0 flex-col bg-sidebar">
					{children}
				</div>
			</div>
		</div>
	);
}

/** Button 的 onClick 参数是 Base UI 包装过的事件，不是原生 MouseEvent。 */
type TriggerClickEvent = Parameters<
	NonNullable<ComponentProps<typeof Button>["onClick"]>
>[0];

/** 展开 / 收起按钮。窄屏开抽屉，宽屏折叠固定面。 */
export function SidebarTrigger({
	className,
	onClick,
	...props
}: ComponentProps<typeof Button>) {
	const { isCompact, open, openMobile, toggleSidebar } = useSidebar();
	// 调用方传的 onClick 先走，再切换：外部可能要在同一次点击里记埋点或关别的浮层
	const handleClick = useCallback(
		(event: TriggerClickEvent) => {
			onClick?.(event);
			toggleSidebar();
		},
		[onClick, toggleSidebar]
	);
	/*
	 * 抽屉和固定面的展开状态是两个互不相干的 state，按钮同一时刻只控制其中一个，
	 * 所以对外只能报当前形态的那一个。只看 open 的话，窄屏抽屉关着时仍会因为
	 * 宽屏那份状态是展开而报 aria-expanded="true"，读屏会念出一个不存在的展开态。
	 */
	const expanded = isCompact ? openMobile : open;
	return (
		<Button
			aria-expanded={expanded}
			className={className}
			data-slot="sidebar-trigger"
			onClick={handleClick}
			size="icon"
			variant="ghost"
			{...props}
		>
			<PanelLeftIcon />
			<span className="sr-only">切换侧边栏</span>
		</Button>
	);
}

/**
 * 面板右缘的一条细长热区，点一下切换展开 / 收起。放在 `<Sidebar>` 的子节点里。
 *
 * `tabIndex={-1}` 是有意的：键盘用户已经有 ⌘B 和 SidebarTrigger 两条明确的路，
 * 而这条热区只有 16px 宽、没有可视的焦点落点，把它排进 tab 序列只会多一个
 * 「按 Tab 时焦点消失了一下」的空位。它存在的意义是给鼠标的顺手入口——
 * 指针滑到面板边缘就能收，不必回头去找左上角的按钮。
 */
export function SidebarRail({ className, ...props }: ComponentProps<"button">) {
	const { toggleSidebar } = useSidebar();
	return (
		<button
			aria-label="切换侧边栏"
			className={cn(
				// 热区 16px 宽但只画中间 2px 的一条线，命中范围远大于看得见的部分
				"absolute inset-y-0 -right-4 z-20 hidden w-4 -translate-x-1/2 cursor-w-resize after:absolute after:inset-y-0 after:left-1/2 after:w-0.5 after:transition-control hover:after:bg-sidebar-border lg:flex",
				// 收起后方向反过来：图标轨要往右拉才是展开
				"group-data-[state=collapsed]:cursor-e-resize",
				// offcanvas 收起时整块面板在视口外，热区跟着出去就点不到了；
				// 贴到屏幕左缘露出一半，鼠标仍有办法把它唤回来
				"group-data-[collapsible=offcanvas]:-right-2 group-data-[collapsible=offcanvas]:translate-x-0",
				className
			)}
			data-slot="sidebar-rail"
			onClick={toggleSidebar}
			tabIndex={-1}
			type="button"
			{...props}
		/>
	);
}

/**
 * 侧边栏右侧的主内容区。
 *
 * 刻意不是 `<main>`：各路由自己渲染带 `id="main"` 的 `<main>`（跳转链接的落点），
 * 嵌套 main 会让地标结构失效。
 */
export function SidebarInset({ className, ...props }: ComponentProps<"div">) {
	return (
		<div
			className={cn(
				"relative flex min-h-0 w-full min-w-0 flex-1 flex-col bg-background",
				className
			)}
			data-slot="sidebar-inset"
			{...props}
		/>
	);
}

/** 顶部品牌 / 项目切换区。 */
export function SidebarHeader({ className, ...props }: ComponentProps<"div">) {
	return (
		<div
			className={cn("flex flex-col gap-2 p-2", className)}
			data-slot="sidebar-header"
			{...props}
		/>
	);
}

/** 底部用户区。 */
export function SidebarFooter({ className, ...props }: ComponentProps<"div">) {
	return (
		<div
			className={cn("flex flex-col gap-2 p-2", className)}
			data-slot="sidebar-footer"
			{...props}
		/>
	);
}

/** 可滚动的主体。min-h-0 是必需的：没有它 flex 子项不会收缩，滚动条不出现。 */
export function SidebarContent({ className, ...props }: ComponentProps<"div">) {
	return (
		<div
			className={cn(
				// 收成图标轨时改为裁掉溢出：48px 宽放不下展开态的文字，
				// 否则收窄的过程中会先冒出一条横向滚动条再消失
				"flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto group-data-[collapsible=icon]:overflow-hidden",
				className
			)}
			data-slot="sidebar-content"
			{...props}
		/>
	);
}

/** 一组导航项。组间距靠 SidebarContent 的 gap-2 拉开，不画分隔线。 */
export function SidebarGroup({ className, ...props }: ComponentProps<"div">) {
	return (
		<div
			className={cn("relative flex w-full min-w-0 flex-col px-2", className)}
			data-slot="sidebar-group"
			{...props}
		/>
	);
}

export function SidebarGroupLabel({
	className,
	...props
}: ComponentProps<"div">) {
	return (
		<div
			/*
			 * 图标轨里把自己收成 0 高再淡出：48px 宽放不下组标题，靠 SidebarContent
			 * 的 overflow-hidden 硬裁会露出半个字；负 margin 让它腾出的空间同时被
			 * 下面的菜单补上，收起时不会留一道空白。
			 */
			className={cn(
				"flex h-7 shrink-0 items-center px-2 font-medium text-sidebar-foreground/70 text-xs transition-sidebar-label group-data-[collapsible=icon]:-mt-7 group-data-[collapsible=icon]:opacity-0",
				className
			)}
			data-slot="sidebar-group-label"
			{...props}
		/>
	);
}

export function SidebarSeparator({
	className,
	...props
}: ComponentProps<typeof Separator>) {
	return (
		<Separator
			className={cn("mx-2 w-auto bg-sidebar-border", className)}
			data-slot="sidebar-separator"
			{...props}
		/>
	);
}

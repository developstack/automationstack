"use client";

import { useSidebar } from "@automationstack/ui/components/sidebar-context";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@automationstack/ui/components/tooltip";
import { cn } from "@automationstack/ui/lib/utils";
import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps, ReactElement } from "react";

/**
 * 一组导航行。
 *
 * 行距取 gap-1（4px），跟二级面板模块树容器（module-tree.tsx 的 `<aside class="… gap-1 p-2">`）
 * 用的是同一个值：一二级两栏并排时行与行的节奏必须对齐，一边 0 一边 4px 会看成
 * 「左边焊死、右边松快」，而两栏本来就同色同背景、没有别的分界手段来解释这种差异。
 *
 * 与组间距的关系也因此成立：组间距是 SidebarContent 的 gap-2（8px），组内是这里的 4px，
 * 正好 2 倍——「组间距 ≥ 2× 组内间距」，分组的边界靠间距本身就读得出来，
 * 不必再画分隔线（见 sidebar.tsx 的 SidebarGroup）。
 */
export function SidebarMenu({ className, ...props }: ComponentProps<"ul">) {
	return (
		<ul
			className={cn("flex w-full min-w-0 flex-col gap-1", className)}
			data-slot="sidebar-menu"
			{...props}
		/>
	);
}

export function SidebarMenuItem({ className, ...props }: ComponentProps<"li">) {
	return (
		<li
			className={cn("group/menu-item relative", className)}
			data-slot="sidebar-menu-item"
			{...props}
		/>
	);
}

/**
 * 导航行。选中态是「淡底 + 左侧 2px 指示条」两条线索叠加，缺一条都不够。
 *
 * 竖条的必要性来自收起态：轨里文字标签被藏掉（见下面的 [&>span:last-child]:hidden），
 * data-active:font-medium 随之失去作用对象，于是只剩底色在说话——而原先的选中底压侧栏底
 * 实测只有 1.045:1（亮）/ 1.185:1（暗），等于没说。换成 --sidebar-selected 后也只是
 * 1.291:1 / 1.524:1：填充本来就不该独自承担可见性，它的任务只是压得过悬停态那一档
 * （1.236:1 / 1.286:1，两态不再同色）。真正看得见的是竖条，取 --sidebar-foreground，
 * 压填充 14.68:1 / 11.26:1。
 *
 * 上下各内缩 6px（before:inset-y-1.5），条长 20px，正好是 32px 行高的 5/8。这里刻意没有
 * 取 rounded-md 的整数半径 8px：本仓库 --radius 是 10px，故 --radius-md = 8px，内缩 8px 才
 * 严格让开圆弧，但条会缩到 16px、显得短。取 6px 的代价是条的最尖端被 overflow-hidden 沿弧
 * 削掉约 0.25px，而那一丝落在条自身 rounded-full 的圆角之外，看不出来。
 * 收起态不做特例——轨里行本身就是那 32px 的方格，left-0 正贴轨的左缘。
 *
 * 选中与悬停都不再改文字色（原来的 data-active:/hover:text-sidebar-accent-foreground 已删）：
 * 那个令牌亮色下 0.205 比继承来的 --sidebar-foreground(0.145) 更浅，把选中行的文字改弱了；
 * 暗色下两者同为 0.985，是空操作。两头都没有正收益。
 */
const sidebarMenuButtonVariants = cva(
	/*
	 * 收成图标轨时整行变成 32px 的正方形图标格：size-8! + p-2! 要 important 才压得住
	 * 各 size 变体自带的 h-*（变体在 cva 里后拼，优先级同级时靠 important 定胜负）。
	 * 末尾那个 span 是文字标签，48px 宽里放不下，直接藏掉——调用方因此不必自己写一遍。
	 */
	"peer/menu-button relative flex w-full items-center gap-2 overflow-hidden rounded-md px-2 text-left text-xs outline-none transition-control before:absolute before:inset-y-1.5 before:left-0 before:w-0.5 before:rounded-full before:bg-sidebar-foreground before:opacity-0 hover:bg-sidebar-accent focus-visible:ring-1 focus-visible:ring-sidebar-ring aria-disabled:pointer-events-none aria-disabled:opacity-50 data-active:bg-sidebar-selected data-active:font-medium data-active:before:opacity-100 group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:p-2! [&>span:last-child]:truncate group-data-[collapsible=icon]:[&>span:last-child]:hidden [&_svg]:size-4 [&_svg]:shrink-0",
	{
		defaultVariants: { size: "default" },
		variants: {
			size: {
				default: "h-8",
				/* 用户区：两行文字（用户名 + 角色）需要 44px */
				lg: "h-11 group-data-[collapsible=icon]:p-0!",
				sm: "h-7",
			},
		},
	}
);

export interface SidebarMenuButtonProps
	extends useRender.ComponentProps<"button">,
		VariantProps<typeof sidebarMenuButtonVariants> {
	isActive?: boolean;
	/** 收成图标轨后替代被藏起来的文字标签的悬停提示；展开态不弹。 */
	tooltip?: string;
}

export function SidebarMenuButton({
	className,
	isActive = false,
	render,
	size,
	tooltip,
	...props
}: SidebarMenuButtonProps): ReactElement {
	const { isCompact, state } = useSidebar();
	const button = useRender({
		defaultTagName: "button",
		props: mergeProps<"button">(
			{ className: cn(sidebarMenuButtonVariants({ size }), className) },
			props
		),
		// 有 tooltip 时把渲染权交给 TooltipTrigger，由它接管 hover/focus 的开合，
		// 同时把调用方自己的 render（多半是路由 Link）继续透传下去，不丢
		render: tooltip ? <TooltipTrigger render={render} /> : render,
		state: { active: isActive, slot: "sidebar-menu-button" },
	});

	if (!tooltip) {
		return button;
	}

	return (
		<Tooltip>
			{button}
			{/* 展开态文字就在图标旁边、窄屏抽屉里也是全宽，这两种情况下再弹一个同样的
			    气泡纯属噪音，所以用 hidden 关掉而不是不渲染——保持 Tooltip 结构稳定 */}
			<TooltipContent hidden={state !== "collapsed" || isCompact} side="right">
				{tooltip}
			</TooltipContent>
		</Tooltip>
	);
}

/**
 * 行尾的次级动作（如「新建模块」）。
 *
 * 只在悬停 / 聚焦时显形，但 `after:-inset-2` 把点击区扩到 36px：
 * 视觉上是 20px 的小图标，指针和触摸拿到的是够大的靶子。
 *
 * 这个 36px 的靶子正好卡在 SidebarMenu 的 gap-1 上：行高 32px、图标 top-1.5 起算，
 * 点击区上下各溢出行外 2px，两行之间要有 4px 才刚好各让一半、互不相压。
 * 行距若收回 0，上一行行尾的按钮会盖住下一行的头 2px，把本该落在下一行的点击抢走。
 */
export function SidebarMenuAction({
	className,
	render,
	...props
}: useRender.ComponentProps<"button">) {
	return useRender({
		defaultTagName: "button",
		props: mergeProps<"button">(
			{
				className: cn(
					// 图标轨里整行只剩 32px，塞不下第二个可点目标（挤进去还会盖住图标），直接不渲染
					"absolute top-1.5 right-1 flex aspect-square w-5 items-center justify-center rounded-sm p-0 text-sidebar-foreground outline-none transition-control after:absolute after:-inset-2 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:opacity-100 focus-visible:ring-1 focus-visible:ring-sidebar-ring group-focus-within/menu-item:opacity-100 group-hover/menu-item:opacity-100 group-data-[collapsible=icon]:hidden lg:opacity-0 [&>svg]:size-4 [&>svg]:shrink-0",
					className
				),
			},
			props
		),
		render,
		state: { slot: "sidebar-menu-action" },
	});
}

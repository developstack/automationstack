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

const sidebarMenuButtonVariants = cva(
	"peer/menu-button relative flex w-full items-center gap-2 overflow-hidden rounded-md px-2 text-left text-xs outline-none transition-control before:absolute before:inset-y-1.5 before:left-0 before:w-0.5 before:rounded-full before:bg-sidebar-foreground before:opacity-0 hover:bg-sidebar-accent focus-visible:ring-1 focus-visible:ring-sidebar-ring aria-disabled:pointer-events-none aria-disabled:opacity-50 data-active:bg-sidebar-selected data-active:font-medium data-active:before:opacity-100 group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:p-2! [&>span:last-child]:truncate group-data-[collapsible=icon]:[&>span:last-child]:hidden [&_svg]:size-4 [&_svg]:shrink-0",
	{
		defaultVariants: { size: "default" },
		variants: {
			size: {
				default: "h-8",
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
		render: tooltip ? <TooltipTrigger render={render} /> : render,
		state: { active: isActive, slot: "sidebar-menu-button" },
	});

	if (!tooltip) {
		return button;
	}

	return (
		<Tooltip>
			{button}
			<TooltipContent hidden={state !== "collapsed" || isCompact} side="right">
				{tooltip}
			</TooltipContent>
		</Tooltip>
	);
}

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

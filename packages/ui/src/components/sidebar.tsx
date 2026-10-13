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

type SidebarCollapsible = "icon" | "offcanvas";

export interface SidebarProps extends ComponentProps<"div"> {
	collapsible?: SidebarCollapsible;
}

export function Sidebar({
	children,
	className,
	collapsible = "icon",
}: SidebarProps) {
	const { isCompact } = useSidebar();
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
				<SheetHeader className="sr-only">
					<SheetTitle>导航</SheetTitle>
				</SheetHeader>
				<div className="flex min-h-0 w-full flex-1 flex-col">{children}</div>
			</SheetContent>
		</Sheet>
	);
}

function SidebarPanel({
	children,
	className,
	collapsible,
}: SidebarProps & { collapsible: SidebarCollapsible }) {
	const { state } = useSidebar();
	return (
		<div
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
					"fixed inset-y-0 left-0 z-10 hidden h-svh w-(--sidebar-width) transition-sidebar-offset group-data-[collapsible=offcanvas]:left-(--sidebar-width-negative) group-data-[collapsible=icon]:w-(--sidebar-width-icon) lg:flex",
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

type TriggerClickEvent = Parameters<
	NonNullable<ComponentProps<typeof Button>["onClick"]>
>[0];

export function SidebarTrigger({
	className,
	onClick,
	...props
}: ComponentProps<typeof Button>) {
	const { isCompact, open, openMobile, toggleSidebar } = useSidebar();
	const handleClick = useCallback(
		(event: TriggerClickEvent) => {
			onClick?.(event);
			toggleSidebar();
		},
		[onClick, toggleSidebar]
	);
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

export function SidebarRail({ className, ...props }: ComponentProps<"button">) {
	const { toggleSidebar } = useSidebar();
	return (
		<button
			aria-label="切换侧边栏"
			className={cn(
				"absolute inset-y-0 -right-4 z-20 hidden w-4 -translate-x-1/2 cursor-w-resize after:absolute after:inset-y-0 after:left-1/2 after:w-0.5 after:transition-control hover:after:bg-sidebar-border lg:flex",
				"group-data-[state=collapsed]:cursor-e-resize",
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

export function SidebarHeader({ className, ...props }: ComponentProps<"div">) {
	return (
		<div
			className={cn("flex flex-col gap-2 p-2", className)}
			data-slot="sidebar-header"
			{...props}
		/>
	);
}

export function SidebarFooter({ className, ...props }: ComponentProps<"div">) {
	return (
		<div
			className={cn("flex flex-col gap-2 p-2", className)}
			data-slot="sidebar-footer"
			{...props}
		/>
	);
}

export function SidebarContent({ className, ...props }: ComponentProps<"div">) {
	return (
		<div
			className={cn(
				"flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto group-data-[collapsible=icon]:overflow-hidden",
				className
			)}
			data-slot="sidebar-content"
			{...props}
		/>
	);
}

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
			className={cn(
				"eyebrow flex h-7 shrink-0 items-center px-2 transition-sidebar-label group-data-[collapsible=icon]:-mt-7 group-data-[collapsible=icon]:opacity-0",
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

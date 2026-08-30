/* 与 shadcn 原件的两处刻意偏离，与 dropdown-menu.tsx 一一对应：

   1. 浮层的进出场由 tw-animate-css 关键帧（data-open:animate-in /
      data-closed:animate-out 那一整套）换成了 packages/ui/src/styles/globals.css
      里的 popup-transition 工具类。理由见该工具类上方的注释：关键帧不可打断，
      退场播到一半再打开会跳回位移起点重播，而本仓的模块树每一行都挂着这类浮层。
      换过去同时消费了 Base UI 的 data-instant（键盘连续操作时不留拖影），并让
      时长与缓动落在一处可改的地方。

   2. 「当前项」的底色由每项各自的 `focus:bg-accent` 硬切换，换成一块在项与项
      之间滑过去的共享高亮（menu-primitives.tsx → effects-highlight.tsx，motion
      的 spring，可打断）。

   这两处都会让 shadcn add context-menu --diff 报出差异，属预期。

   ── 为什么这里 import 的是 menu-primitives 而不是另一份 context-menu 原语 ──

   Base UI 1.7.0 的 `@base-ui/react/context-menu` 只自带 Root 与 Trigger；
   Portal / Positioner / Popup / Item / CheckboxItem / RadioItem / Submenu* /
   Group / GroupLabel / Separator 这一整套，在它的 index.parts 里就是从
   `../menu/…` 原样再导出的，运行时与 `@base-ui/react/menu` 是同一批对象。
   所以 vendored 层只做了一份（menu-primitives.tsx），这里取 ContextMenuRoot /
   ContextMenuTrigger，其余与 dropdown-menu.tsx 共用同一批组件。
   类型仍从 `@base-ui/react/context-menu` 取（那些 Props 别名指向的就是 Menu 的
   同一批类型），这样对外暴露的 props 类型与迁移前逐字相同。 */

import {
	ContextMenuRoot,
	ContextMenuTrigger as ContextMenuTriggerPrimitive,
	MenuCheckboxItem,
	MenuCheckboxItemIndicator,
	MenuGroup,
	MenuGroupLabel,
	MenuHighlight,
	MenuHighlightItem,
	MenuItem,
	MenuPopup,
	MenuPortal,
	MenuPositioner,
	MenuRadioGroup,
	MenuRadioItem,
	MenuRadioItemIndicator,
	MenuSeparator,
	MenuSubmenuRoot,
	MenuSubmenuTrigger,
} from "@automationstack/ui/components/menu-primitives";
import { cn } from "@automationstack/ui/lib/utils";
import type { ContextMenu as ContextMenuPrimitive } from "@base-ui/react/context-menu";
import { CheckIcon, ChevronRightIcon } from "lucide-react";
import type * as React from "react";

/** destructive 项的高亮块要换个颜色；cn 走 tailwind-merge，后写的 bg 赢。 */
const DESTRUCTIVE_HIGHLIGHT = "bg-destructive/10 dark:bg-destructive/20";

function ContextMenu({ ...props }: ContextMenuPrimitive.Root.Props) {
	return <ContextMenuRoot data-slot="context-menu" {...props} />;
}

function ContextMenuPortal({ ...props }: ContextMenuPrimitive.Portal.Props) {
	return <MenuPortal data-slot="context-menu-portal" {...props} />;
}

function ContextMenuTrigger({
	className,
	...props
}: ContextMenuPrimitive.Trigger.Props) {
	return (
		<ContextMenuTriggerPrimitive
			className={cn("select-none", className)}
			data-slot="context-menu-trigger"
			{...props}
		/>
	);
}

/*
 * 与 dropdown-menu.tsx 的 Content 只差两处，都是「锚点是光标点」带来的：
 * - 不加 `w-(--anchor-width)`：右键菜单的锚点是一个 0×0 的点，跟着它等宽等于没宽度；
 *   宽度只能由内容和 `min-w-36` 撑开。
 * - 默认 `side="right" align="start"`：从光标点向右下展开，是右键菜单的既有惯例。
 */
function ContextMenuContent({
	align = "start",
	alignOffset = 4,
	side = "right",
	sideOffset = 0,
	children,
	className,
	...props
}: ContextMenuPrimitive.Popup.Props &
	Pick<
		ContextMenuPrimitive.Positioner.Props,
		"align" | "alignOffset" | "side" | "sideOffset"
	>) {
	return (
		<MenuPortal>
			<MenuPositioner
				align={align}
				alignOffset={alignOffset}
				className="isolate z-50 outline-none"
				side={side}
				sideOffset={sideOffset}
			>
				<MenuPopup
					className={cn(
						"popup-transition z-50 max-h-(--available-height) min-w-36 origin-(--transform-origin) overflow-y-auto overflow-x-hidden rounded-md bg-popover p-1 text-popover-foreground shadow-md outline-none ring-1 ring-foreground/10 data-closed:overflow-hidden",
						className
					)}
					data-slot="context-menu-content"
					{...props}
				>
					{/*
					 * 高亮层放在 Popup 内部而不是外面：它是绝对定位的，坐标要落在
					 * 弹层自己的坐标系里；而且弹层滚动时它得跟着内容一起滚。
					 * 这一层自己不产 DOM（controlledItems + children 模式）。
					 */}
					<MenuHighlight className="inset-0 rounded-sm bg-accent">
						{children}
					</MenuHighlight>
				</MenuPopup>
			</MenuPositioner>
		</MenuPortal>
	);
}

function ContextMenuGroup({ ...props }: ContextMenuPrimitive.Group.Props) {
	return <MenuGroup data-slot="context-menu-group" {...props} />;
}

function ContextMenuLabel({
	className,
	inset,
	...props
}: ContextMenuPrimitive.GroupLabel.Props & {
	inset?: boolean;
}) {
	return (
		<MenuGroupLabel
			className={cn(
				"px-2 py-1.5 font-medium text-muted-foreground text-xs data-inset:pl-8",
				className
			)}
			data-inset={inset}
			data-slot="context-menu-label"
			{...props}
		/>
	);
}

function ContextMenuItem({
	className,
	inset,
	variant = "default",
	...props
}: ContextMenuPrimitive.Item.Props & {
	inset?: boolean;
	variant?: "default" | "destructive";
}) {
	return (
		<MenuHighlightItem
			activeClassName={
				variant === "destructive" ? DESTRUCTIVE_HIGHLIGHT : undefined
			}
		>
			<MenuItem
				className={cn(
					"group/context-menu-item relative flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden focus:text-accent-foreground not-data-[variant=destructive]:focus:**:text-accent-foreground data-disabled:pointer-events-none data-inset:pl-8 data-[variant=destructive]:text-destructive data-disabled:opacity-50 data-[variant=destructive]:focus:text-destructive [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0 data-[variant=destructive]:*:[svg]:text-destructive",
					className
				)}
				data-inset={inset}
				data-slot="context-menu-item"
				data-variant={variant}
				{...props}
			/>
		</MenuHighlightItem>
	);
}

function ContextMenuSub({ ...props }: ContextMenuPrimitive.SubmenuRoot.Props) {
	return <MenuSubmenuRoot data-slot="context-menu-sub" {...props} />;
}

function ContextMenuSubTrigger({
	className,
	inset,
	children,
	...props
}: ContextMenuPrimitive.SubmenuTrigger.Props & {
	inset?: boolean;
}) {
	return (
		<MenuHighlightItem>
			<MenuSubmenuTrigger
				className={cn(
					"flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden focus:text-accent-foreground not-data-[variant=destructive]:focus:**:text-accent-foreground data-open:bg-accent data-popup-open:bg-accent data-inset:pl-8 data-open:text-accent-foreground data-popup-open:text-accent-foreground [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
					className
				)}
				data-inset={inset}
				data-slot="context-menu-sub-trigger"
				{...props}
			>
				{children}
				<ChevronRightIcon className="ml-auto" />
			</MenuSubmenuTrigger>
		</MenuHighlightItem>
	);
}

function ContextMenuSubContent({
	align = "start",
	alignOffset = -3,
	side = "right",
	sideOffset = 0,
	className,
	...props
}: React.ComponentProps<typeof ContextMenuContent>) {
	return (
		<ContextMenuContent
			align={align}
			alignOffset={alignOffset}
			className={cn("w-auto shadow-lg", className)}
			data-slot="context-menu-sub-content"
			side={side}
			sideOffset={sideOffset}
			{...props}
		/>
	);
}

function ContextMenuCheckboxItem({
	className,
	children,
	checked,
	inset,
	...props
}: ContextMenuPrimitive.CheckboxItem.Props & {
	inset?: boolean;
}) {
	return (
		<MenuHighlightItem>
			<MenuCheckboxItem
				checked={checked}
				className={cn(
					"relative flex cursor-default select-none items-center gap-2 rounded-sm py-1.5 pr-8 pl-2 text-sm outline-hidden focus:text-accent-foreground focus:**:text-accent-foreground data-disabled:pointer-events-none data-inset:pl-8 data-disabled:opacity-50 [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
					className
				)}
				data-inset={inset}
				data-slot="context-menu-checkbox-item"
				{...props}
			>
				<span
					className="pointer-events-none absolute right-2 flex items-center justify-center"
					data-slot="context-menu-checkbox-item-indicator"
				>
					<MenuCheckboxItemIndicator>
						<CheckIcon />
					</MenuCheckboxItemIndicator>
				</span>
				{children}
			</MenuCheckboxItem>
		</MenuHighlightItem>
	);
}

function ContextMenuRadioGroup({
	...props
}: ContextMenuPrimitive.RadioGroup.Props) {
	return <MenuRadioGroup data-slot="context-menu-radio-group" {...props} />;
}

function ContextMenuRadioItem({
	className,
	children,
	inset,
	...props
}: ContextMenuPrimitive.RadioItem.Props & {
	inset?: boolean;
}) {
	return (
		<MenuHighlightItem>
			<MenuRadioItem
				className={cn(
					"relative flex cursor-default select-none items-center gap-2 rounded-sm py-1.5 pr-8 pl-2 text-sm outline-hidden focus:text-accent-foreground focus:**:text-accent-foreground data-disabled:pointer-events-none data-inset:pl-8 data-disabled:opacity-50 [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
					className
				)}
				data-inset={inset}
				data-slot="context-menu-radio-item"
				{...props}
			>
				<span
					className="pointer-events-none absolute right-2 flex items-center justify-center"
					data-slot="context-menu-radio-item-indicator"
				>
					<MenuRadioItemIndicator>
						<CheckIcon />
					</MenuRadioItemIndicator>
				</span>
				{children}
			</MenuRadioItem>
		</MenuHighlightItem>
	);
}

function ContextMenuSeparator({
	className,
	...props
}: ContextMenuPrimitive.Separator.Props) {
	return (
		<MenuSeparator
			className={cn("-mx-1 my-1 h-px bg-border", className)}
			data-slot="context-menu-separator"
			{...props}
		/>
	);
}

function ContextMenuShortcut({
	className,
	...props
}: React.ComponentProps<"span">) {
	return (
		<span
			className={cn(
				"ml-auto text-muted-foreground text-xs tracking-widest group-focus/context-menu-item:text-accent-foreground",
				className
			)}
			data-slot="context-menu-shortcut"
			{...props}
		/>
	);
}

export {
	ContextMenu,
	ContextMenuCheckboxItem,
	ContextMenuContent,
	ContextMenuGroup,
	ContextMenuItem,
	ContextMenuLabel,
	ContextMenuPortal,
	ContextMenuRadioGroup,
	ContextMenuRadioItem,
	ContextMenuSeparator,
	ContextMenuShortcut,
	ContextMenuSub,
	ContextMenuSubContent,
	ContextMenuSubTrigger,
	ContextMenuTrigger,
};

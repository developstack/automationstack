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
						"popup-transition z-50 max-h-(--available-height) min-w-36 origin-(--transform-origin) overflow-y-auto overflow-x-hidden overscroll-contain rounded-lg bg-popover p-1 text-popover-foreground shadow-popover outline-none ring-1 ring-foreground/10 data-closed:overflow-hidden",
						className
					)}
					data-slot="context-menu-content"
					{...props}
				>
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

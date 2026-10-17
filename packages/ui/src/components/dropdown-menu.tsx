import {
	Menu,
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
	MenuTrigger,
} from "@automationstack/ui/components/menu-primitives";
import { cn } from "@automationstack/ui/lib/utils";
import type { Menu as MenuPrimitive } from "@base-ui/react/menu";
import { CheckIcon, ChevronRightIcon } from "lucide-react";
import type * as React from "react";

const DESTRUCTIVE_HIGHLIGHT = "bg-destructive/10 dark:bg-destructive/20";

function DropdownMenu({ ...props }: MenuPrimitive.Root.Props) {
	return <Menu data-slot="dropdown-menu" {...props} />;
}

function DropdownMenuPortal({ ...props }: MenuPrimitive.Portal.Props) {
	return <MenuPortal data-slot="dropdown-menu-portal" {...props} />;
}

function DropdownMenuTrigger({ ...props }: MenuPrimitive.Trigger.Props) {
	return <MenuTrigger data-slot="dropdown-menu-trigger" {...props} />;
}

function DropdownMenuContent({
	align = "start",
	alignOffset = 0,
	side = "bottom",
	sideOffset = 4,
	children,
	className,
	...props
}: MenuPrimitive.Popup.Props &
	Pick<
		MenuPrimitive.Positioner.Props,
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
						"popup-transition z-50 max-h-(--available-height) w-(--anchor-width) min-w-32 origin-(--transform-origin) overflow-y-auto overflow-x-hidden overscroll-contain rounded-lg border border-transparent bg-popover p-1 text-popover-foreground shadow-popover outline-none ring-1 ring-foreground/10 data-closed:overflow-hidden",
						className
					)}
					data-slot="dropdown-menu-content"
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

function DropdownMenuGroup({ ...props }: MenuPrimitive.Group.Props) {
	return <MenuGroup data-slot="dropdown-menu-group" {...props} />;
}

function DropdownMenuLabel({
	className,
	inset,
	...props
}: MenuPrimitive.GroupLabel.Props & {
	inset?: boolean;
}) {
	return (
		<MenuGroupLabel
			className={cn(
				"px-2 py-1.5 font-medium text-muted-foreground text-xs data-inset:pl-8",
				className
			)}
			data-inset={inset}
			data-slot="dropdown-menu-label"
			{...props}
		/>
	);
}

function DropdownMenuItem({
	className,
	inset,
	variant = "default",
	...props
}: MenuPrimitive.Item.Props & {
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
					"group/dropdown-menu-item relative flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden focus:text-accent-foreground not-data-[variant=destructive]:focus:**:text-accent-foreground data-disabled:pointer-events-none data-inset:pl-8 data-[variant=destructive]:text-destructive data-disabled:opacity-50 data-[variant=destructive]:focus:text-destructive [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0 data-[variant=destructive]:*:[svg]:text-destructive",
					className
				)}
				data-inset={inset}
				data-slot="dropdown-menu-item"
				data-variant={variant}
				{...props}
			/>
		</MenuHighlightItem>
	);
}

function DropdownMenuSub({ ...props }: MenuPrimitive.SubmenuRoot.Props) {
	return <MenuSubmenuRoot data-slot="dropdown-menu-sub" {...props} />;
}

function DropdownMenuSubTrigger({
	className,
	inset,
	children,
	...props
}: MenuPrimitive.SubmenuTrigger.Props & {
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
				data-slot="dropdown-menu-sub-trigger"
				{...props}
			>
				{children}
				<ChevronRightIcon className="ml-auto" />
			</MenuSubmenuTrigger>
		</MenuHighlightItem>
	);
}

function DropdownMenuSubContent({
	align = "start",
	alignOffset = -3,
	side = "right",
	sideOffset = 0,
	className,
	...props
}: React.ComponentProps<typeof DropdownMenuContent>) {
	return (
		<DropdownMenuContent
			align={align}
			alignOffset={alignOffset}
			className={cn(
				"popup-transition w-auto min-w-[96px] rounded-lg bg-popover p-1 text-popover-foreground shadow-popover ring-1 ring-foreground/10",
				className
			)}
			data-slot="dropdown-menu-sub-content"
			side={side}
			sideOffset={sideOffset}
			{...props}
		/>
	);
}

function DropdownMenuCheckboxItem({
	className,
	children,
	checked,
	inset,
	...props
}: MenuPrimitive.CheckboxItem.Props & {
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
				data-slot="dropdown-menu-checkbox-item"
				{...props}
			>
				<span
					className="pointer-events-none absolute right-2 flex items-center justify-center"
					data-slot="dropdown-menu-checkbox-item-indicator"
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

function DropdownMenuRadioGroup({ ...props }: MenuPrimitive.RadioGroup.Props) {
	return <MenuRadioGroup data-slot="dropdown-menu-radio-group" {...props} />;
}

function DropdownMenuRadioItem({
	className,
	children,
	inset,
	...props
}: MenuPrimitive.RadioItem.Props & {
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
				data-slot="dropdown-menu-radio-item"
				{...props}
			>
				<span
					className="pointer-events-none absolute right-2 flex items-center justify-center"
					data-slot="dropdown-menu-radio-item-indicator"
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

function DropdownMenuSeparator({
	className,
	...props
}: MenuPrimitive.Separator.Props) {
	return (
		<MenuSeparator
			className={cn("-mx-1 my-1 h-px bg-border", className)}
			data-slot="dropdown-menu-separator"
			{...props}
		/>
	);
}

function DropdownMenuShortcut({
	className,
	...props
}: React.ComponentProps<"span">) {
	return (
		<span
			className={cn(
				"ml-auto text-muted-foreground text-xs tracking-widest group-focus/dropdown-menu-item:text-accent-foreground",
				className
			)}
			data-slot="dropdown-menu-shortcut"
			{...props}
		/>
	);
}

export {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuPortal,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuSeparator,
	DropdownMenuShortcut,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
};

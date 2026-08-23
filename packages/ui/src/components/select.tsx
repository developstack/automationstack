/* 与 shadcn 原件的一处刻意偏离：浮层的进出场由 tw-animate-css 关键帧
   （data-open:animate-in / data-closed:animate-out 那一整套）换成了
   packages/ui/src/styles/globals.css 里的 popup-transition 工具类。
   理由见该工具类上方的注释：关键帧不可打断，退场播到一半再打开会跳回位移起点
   重播，而本仓的模块树每一行都挂着这类浮层。换过去同时消费了 Base UI 的
   data-instant（键盘连续操作时不留拖影），并让时长与缓动落在一处可改的地方。
   shadcn add select --diff 会因此报出这一行的差异，属预期。

   同时删掉了 data-[align-trigger=true]:animate-none：align-trigger 在
   @base-ui/react@1.7.0 里 0 命中，Base UI 实际发的是 data-side="none"
   （select/positioner/SelectPositioner.js:107），这条抑制从未生效过。
   popup-transition 的位移分支全部挂在具体 data-side 值上，"none" 一条都匹配
   不上，自动退化成只有 opacity + scale，正是那条死选择器本来想要的效果。 */

import { cn } from "@automationstack/ui/lib/utils";
import { Select as SelectPrimitive } from "@base-ui/react/select";
import { CheckIcon, ChevronDownIcon, ChevronUpIcon } from "lucide-react";
import type * as React from "react";

const Select = SelectPrimitive.Root;

function SelectGroup({ className, ...props }: SelectPrimitive.Group.Props) {
	return (
		<SelectPrimitive.Group
			className={cn("scroll-my-1 p-1", className)}
			data-slot="select-group"
			{...props}
		/>
	);
}

function SelectValue({ className, ...props }: SelectPrimitive.Value.Props) {
	return (
		<SelectPrimitive.Value
			className={cn("flex flex-1 text-left", className)}
			data-slot="select-value"
			{...props}
		/>
	);
}

function SelectTrigger({
	className,
	size = "default",
	children,
	...props
}: SelectPrimitive.Trigger.Props & {
	size?: "sm" | "default";
}) {
	return (
		<SelectPrimitive.Trigger
			/*
			 * 刻意偏离上游：上游这里是物理属性 `pr-2 pl-2.5`，在 dir="rtl" 下不会
			 * 跟着镜像（首侧内缩会跑到尾侧），本仓库 better-layout 基线要求逻辑属性，
			 * 故改为 `pe-2 ps-2.5`。LTR 下两者的计算值完全一致，是零视觉差的替换。
			 * 注：同文件的 SelectItem（pr-8 pl-2）与 ItemIndicator（right-2）有同类
			 * 问题，本轮未改——它们不在本次指定范围内，且上一批已 review 的
			 * tabs/popover/table 也仍是物理属性，单独改这里会加深不一致。
			 */
			className={cn(
				"flex w-fit items-center justify-between gap-1.5 whitespace-nowrap rounded-md border border-input bg-transparent py-2 ps-2.5 pe-2 text-sm shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 data-[size=default]:h-9 data-[size=sm]:h-8 data-placeholder:text-muted-foreground *:data-[slot=select-value]:line-clamp-1 *:data-[slot=select-value]:flex *:data-[slot=select-value]:items-center *:data-[slot=select-value]:gap-1.5 dark:bg-input/30 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 dark:hover:bg-input/50 [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
				className
			)}
			data-size={size}
			data-slot="select-trigger"
			{...props}
		>
			{children}
			<SelectPrimitive.Icon
				render={
					<ChevronDownIcon className="pointer-events-none size-4 text-muted-foreground" />
				}
			/>
		</SelectPrimitive.Trigger>
	);
}

function SelectContent({
	className,
	children,
	side = "bottom",
	sideOffset = 4,
	align = "center",
	alignOffset = 0,
	alignItemWithTrigger = true,
	...props
}: SelectPrimitive.Popup.Props &
	Pick<
		SelectPrimitive.Positioner.Props,
		"align" | "alignOffset" | "side" | "sideOffset" | "alignItemWithTrigger"
	>) {
	return (
		<SelectPrimitive.Portal>
			<SelectPrimitive.Positioner
				align={align}
				alignItemWithTrigger={alignItemWithTrigger}
				alignOffset={alignOffset}
				className="isolate z-50"
				side={side}
				sideOffset={sideOffset}
			>
				<SelectPrimitive.Popup
					className={cn(
						"popup-transition relative isolate z-50 max-h-(--available-height) w-(--anchor-width) min-w-36 origin-(--transform-origin) overflow-y-auto overflow-x-hidden rounded-md bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10",
						className
					)}
					data-align-trigger={alignItemWithTrigger}
					data-slot="select-content"
					{...props}
				>
					<SelectScrollUpButton />
					<SelectPrimitive.List>{children}</SelectPrimitive.List>
					<SelectScrollDownButton />
				</SelectPrimitive.Popup>
			</SelectPrimitive.Positioner>
		</SelectPrimitive.Portal>
	);
}

function SelectLabel({
	className,
	...props
}: SelectPrimitive.GroupLabel.Props) {
	return (
		<SelectPrimitive.GroupLabel
			className={cn("px-2 py-1.5 text-muted-foreground text-xs", className)}
			data-slot="select-label"
			{...props}
		/>
	);
}

function SelectItem({
	className,
	children,
	...props
}: SelectPrimitive.Item.Props) {
	return (
		<SelectPrimitive.Item
			className={cn(
				"relative flex w-full cursor-default select-none items-center gap-2 rounded-sm py-1.5 pr-8 pl-2 text-sm outline-hidden focus:bg-accent focus:text-accent-foreground not-data-[variant=destructive]:focus:**:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0 *:[span]:last:flex *:[span]:last:items-center *:[span]:last:gap-2",
				className
			)}
			data-slot="select-item"
			{...props}
		>
			<SelectPrimitive.ItemText className="flex flex-1 shrink-0 gap-2 whitespace-nowrap">
				{children}
			</SelectPrimitive.ItemText>
			<SelectPrimitive.ItemIndicator
				render={
					<span className="pointer-events-none absolute right-2 flex size-4 items-center justify-center" />
				}
			>
				<CheckIcon className="pointer-events-none" />
			</SelectPrimitive.ItemIndicator>
		</SelectPrimitive.Item>
	);
}

function SelectSeparator({
	className,
	...props
}: SelectPrimitive.Separator.Props) {
	return (
		<SelectPrimitive.Separator
			className={cn("pointer-events-none -mx-1 my-1 h-px bg-border", className)}
			data-slot="select-separator"
			{...props}
		/>
	);
}

function SelectScrollUpButton({
	className,
	...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollUpArrow>) {
	return (
		<SelectPrimitive.ScrollUpArrow
			className={cn(
				"top-0 z-10 flex w-full cursor-default items-center justify-center bg-popover py-1 [&_svg:not([class*='size-'])]:size-4",
				className
			)}
			data-slot="select-scroll-up-button"
			{...props}
		>
			<ChevronUpIcon />
		</SelectPrimitive.ScrollUpArrow>
	);
}

function SelectScrollDownButton({
	className,
	...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollDownArrow>) {
	return (
		<SelectPrimitive.ScrollDownArrow
			className={cn(
				"bottom-0 z-10 flex w-full cursor-default items-center justify-center bg-popover py-1 [&_svg:not([class*='size-'])]:size-4",
				className
			)}
			data-slot="select-scroll-down-button"
			{...props}
		>
			<ChevronDownIcon />
		</SelectPrimitive.ScrollDownArrow>
	);
}

export {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectLabel,
	SelectScrollDownButton,
	SelectScrollUpButton,
	SelectSeparator,
	SelectTrigger,
	SelectValue,
};

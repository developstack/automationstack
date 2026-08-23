/* 与 shadcn 原件的一处刻意偏离：浮层的进出场由 tw-animate-css 关键帧
   （data-open:animate-in / data-closed:animate-out 那一整套）换成了
   packages/ui/src/styles/globals.css 里的 popup-transition 工具类。
   理由见该工具类上方的注释：关键帧不可打断，退场播到一半再打开会跳回位移起点
   重播，而本仓的模块树每一行都挂着这类浮层。换过去同时消费了 Base UI 的
   data-instant（键盘连续操作时不留拖影），并让时长与缓动落在一处可改的地方。
   shadcn add popover --diff 会因此报出这一行的差异，属预期。 */

import { cn } from "@automationstack/ui/lib/utils";
import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import type * as React from "react";

function Popover({ ...props }: PopoverPrimitive.Root.Props) {
	return <PopoverPrimitive.Root data-slot="popover" {...props} />;
}

function PopoverTrigger({ ...props }: PopoverPrimitive.Trigger.Props) {
	return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />;
}

function PopoverContent({
	className,
	align = "center",
	alignOffset = 0,
	side = "bottom",
	sideOffset = 4,
	...props
}: PopoverPrimitive.Popup.Props &
	Pick<
		PopoverPrimitive.Positioner.Props,
		"align" | "alignOffset" | "side" | "sideOffset"
	>) {
	return (
		<PopoverPrimitive.Portal>
			<PopoverPrimitive.Positioner
				align={align}
				alignOffset={alignOffset}
				className="isolate z-50"
				side={side}
				sideOffset={sideOffset}
			>
				<PopoverPrimitive.Popup
					className={cn(
						"popup-transition z-50 flex w-72 origin-(--transform-origin) flex-col gap-4 rounded-md bg-popover p-4 text-popover-foreground text-sm shadow-md outline-hidden ring-1 ring-foreground/10",
						className
					)}
					data-slot="popover-content"
					{...props}
				/>
			</PopoverPrimitive.Positioner>
		</PopoverPrimitive.Portal>
	);
}

function PopoverHeader({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			className={cn("flex flex-col gap-1 text-sm", className)}
			data-slot="popover-header"
			{...props}
		/>
	);
}

function PopoverTitle({ className, ...props }: PopoverPrimitive.Title.Props) {
	return (
		<PopoverPrimitive.Title
			className={cn("font-medium", className)}
			data-slot="popover-title"
			{...props}
		/>
	);
}

function PopoverDescription({
	className,
	...props
}: PopoverPrimitive.Description.Props) {
	return (
		<PopoverPrimitive.Description
			className={cn("text-muted-foreground", className)}
			data-slot="popover-description"
			{...props}
		/>
	);
}

export {
	Popover,
	PopoverContent,
	PopoverDescription,
	PopoverHeader,
	PopoverTitle,
	PopoverTrigger,
};

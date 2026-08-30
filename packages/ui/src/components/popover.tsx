/* 与 shadcn 原件的一处刻意偏离：浮层的进出场既不用 tw-animate-css 的关键帧
   （data-open:animate-in / data-closed:animate-out 那一整套），也不再用
   globals.css 里的 popup-transition 工具类，改由 popover-primitives.tsx 里
   vendored 的 Animate UI primitive 用 motion 驱动。

   换掉关键帧的理由没变：关键帧不可打断，退场播到一半再打开会跳回位移起点重播。
   popup-transition 当初是用 CSS transition 把这条补上；motion 的 JS 动画本身
   就从当前值继续，同一个问题它自带答案，再叠一层 CSS 过渡只会让两套实现争
   同一批属性，所以这里把类名去掉。popup-transition 顺带消费的 data-instant
   也没丢：popover 的 state 同样带 instant（'dismiss' | 'click' | 'focus' |
   'trigger-change'，其中 click 只在键盘触发时置位，鼠标点开照常有动画），
   primitive 里经 render 的函数形态读它，为真就把 transition 压成 duration 0。
   为什么这条曾被误判为做不到，见 tooltip.tsx 顶部。
   shadcn add popover --diff 会因此报出这一行的差异，属预期。 */

import {
	Popover as PopoverBase,
	PopoverDescription as PopoverDescriptionBase,
	PopoverPopup,
	PopoverPortal,
	PopoverPositioner,
	PopoverTitle as PopoverTitleBase,
	PopoverTrigger as PopoverTriggerBase,
} from "@automationstack/ui/components/popover-primitives";
import { cn } from "@automationstack/ui/lib/utils";
import type { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import type * as React from "react";

function Popover({ ...props }: PopoverPrimitive.Root.Props) {
	return <PopoverBase data-slot="popover" {...props} />;
}

function PopoverTrigger({ ...props }: PopoverPrimitive.Trigger.Props) {
	return <PopoverTriggerBase data-slot="popover-trigger" {...props} />;
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
		<PopoverPortal>
			<PopoverPositioner
				align={align}
				alignOffset={alignOffset}
				className="isolate z-50"
				side={side}
				sideOffset={sideOffset}
			>
				<PopoverPopup
					className={cn(
						"z-50 flex w-72 origin-(--transform-origin) flex-col gap-4 rounded-md bg-popover p-4 text-popover-foreground text-sm shadow-md outline-hidden ring-1 ring-foreground/10",
						className
					)}
					data-slot="popover-content"
					{...props}
				/>
			</PopoverPositioner>
		</PopoverPortal>
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
		<PopoverTitleBase
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
		<PopoverDescriptionBase
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

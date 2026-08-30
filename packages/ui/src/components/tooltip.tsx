"use client";

/* 与 shadcn 原件的一处刻意偏离：浮层的进出场既不用 tw-animate-css 的关键帧
   （data-open:animate-in / data-closed:animate-out 那一整套），也不再用
   globals.css 里的 popup-transition 工具类，改由 tooltip-primitives.tsx 里
   vendored 的 Animate UI primitive 用 motion 驱动。

   换掉关键帧的理由没变：关键帧不可打断，退场播到一半再打开会跳回位移起点重播，
   而本仓的模块树每一行都挂着这类浮层。popup-transition 当初是用 CSS transition
   把这条补上；motion 的 JS 动画本身就从当前值继续，同一个问题它自带答案，
   再叠一层 CSS 过渡只会让两套实现争同一批属性，所以这里把类名去掉。

   popup-transition 顺带消费的 Base UI data-instant（键盘在触发器之间连续移动、
   焦点转移、dismiss 时把时长压到 0，不留拖影）没有跟着丢：primitive 里改用
   render 的函数形态，从第二个参数 state.instant 直接读到同一份信号，为真就把
   transition 换成 duration 0。

   之所以要记这一笔：曾经有过「motion 拿不到 Popup 的 state」的结论，那是错的。
   真正与 motion props 冲突的是「包装组件自身的 props 类型」（Base UI 1.7.0 把
   className/style 重定义成「值或 (state) => 值」，没法同时满足 HTMLMotionProps）；
   而 render 函数形态收到的第一个参数是 Base UI 已经解析好的 HTMLProps，
   className 是 string、style 是 CSSProperties，跟那个冲突不是一回事。
   两者唯一的摩擦是 onDrag / onDragStart / onDragEnd / onAnimationStart 这四个
   同名不同签的处理器，Base UI 不会设置它们，解构剔除即可。

   同时删掉了三个 data-[state=delayed-open]:*：Base UI 的 tooltip 不发
   data-state，那是 Radix 时代留下的死类。 */

import {
	TooltipArrow,
	Tooltip as TooltipBase,
	TooltipPopup,
	TooltipPortal,
	TooltipPositioner,
	TooltipProvider as TooltipProviderBase,
	TooltipTrigger as TooltipTriggerBase,
} from "@automationstack/ui/components/tooltip-primitives";
import { cn } from "@automationstack/ui/lib/utils";
import type { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip";

function TooltipProvider({
	delay = 0,
	...props
}: TooltipPrimitive.Provider.Props) {
	return (
		<TooltipProviderBase
			data-slot="tooltip-provider"
			delay={delay}
			{...props}
		/>
	);
}

function Tooltip({ ...props }: TooltipPrimitive.Root.Props) {
	return <TooltipBase data-slot="tooltip" {...props} />;
}

function TooltipTrigger({ ...props }: TooltipPrimitive.Trigger.Props) {
	return <TooltipTriggerBase data-slot="tooltip-trigger" {...props} />;
}

function TooltipContent({
	className,
	side = "top",
	sideOffset = 4,
	align = "center",
	alignOffset = 0,
	children,
	...props
}: TooltipPrimitive.Popup.Props &
	Pick<
		TooltipPrimitive.Positioner.Props,
		"align" | "alignOffset" | "side" | "sideOffset"
	>) {
	return (
		<TooltipPortal>
			<TooltipPositioner
				align={align}
				alignOffset={alignOffset}
				className="isolate z-50"
				side={side}
				sideOffset={sideOffset}
			>
				<TooltipPopup
					className={cn(
						"z-50 inline-flex w-fit max-w-xs origin-(--transform-origin) items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-background text-xs has-data-[slot=kbd]:pr-1.5 **:data-[slot=kbd]:relative **:data-[slot=kbd]:isolate **:data-[slot=kbd]:z-50 **:data-[slot=kbd]:rounded-sm",
						className
					)}
					data-slot="tooltip-content"
					{...props}
				>
					{children}
					<TooltipArrow className="z-50 size-2.5 translate-y-[calc(-50%-2px)] rotate-45 rounded-[2px] bg-foreground fill-foreground data-[side=bottom]:top-1 data-[side=inline-end]:top-1/2! data-[side=inline-start]:top-1/2! data-[side=left]:top-1/2! data-[side=right]:top-1/2! data-[side=inline-start]:-right-1 data-[side=left]:-right-1 data-[side=top]:-bottom-2.5 data-[side=inline-end]:-left-1 data-[side=right]:-left-1 data-[side=inline-end]:-translate-y-1/2 data-[side=inline-start]:-translate-y-1/2 data-[side=left]:-translate-y-1/2 data-[side=right]:-translate-y-1/2" />
				</TooltipPopup>
			</TooltipPositioner>
		</TooltipPortal>
	);
}

export { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger };

"use client";

/* Animate UI 的 base tooltip primitive（上游 registry/primitives/base/tooltip），
   vendored 进来。与上游源码的出入，逐条都是本仓环境逼出来的：

   1. 包名 `@base-ui-components/react/tooltip` → `@base-ui/react/tooltip`。
      上游写的是旧包名，装进来就是第二份 Base UI，两份实例各有一套 context，
      Trigger 找不到 Root。路径别名同理换成本包的 exports 映射。
   2. props 类型用 Base UI 1.7.0 的 `X.Props`，没有并进 `HTMLMotionProps`。
      1.7.0 把 className/style 重定义成「值或 (state) => 值」，与 motion 的同名
      props 结构互斥，交出去的类型没人能同时满足；动画配置因此只留 `transition`
      一个出口，其余 props 原样交给 Base UI 那一层。注意这个冲突只存在于包装组件
      的 props 类型上，与 render 的函数形态无关——那里拿到的是已解析的 HTMLProps。
   3. Portal 的 keepMounted 写在展开之后。退场动画播的这段时间 DOM 必须还在，
      这是实现细节不是调用方的选项。
   4. 多了 useReducedMotion。本仓 globals.css 末尾那条全局规则只压得住 CSS 过渡，
      motion 走 JS 动画绕开它，得自己认这份偏好。 */

import { useControlledState } from "@automationstack/ui/hooks/use-controlled-state";
import { getStrictContext } from "@automationstack/ui/lib/get-strict-context";
import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip";
import type { HTMLProps } from "@base-ui/react/types";
import {
	AnimatePresence,
	type MotionValue,
	motion,
	type SpringOptions,
	type Transition,
	useMotionValue,
	useReducedMotion,
	useSpring,
} from "motion/react";
import { useCallback } from "react";

const INSTANT: Transition = { duration: 0 };
const POPUP_TRANSITION: Transition = {
	damping: 25,
	stiffness: 300,
	type: "spring",
};
const FOLLOW_CURSOR_SPRING: SpringOptions = { damping: 17, stiffness: 200 };
/** 指针偏移取一半，气泡跟手但不会甩出触发器。 */
const FOLLOW_DAMPENING = 2;

interface TooltipContextType {
	followCursor?: boolean | "x" | "y";
	followCursorSpringOptions?: SpringOptions;
	isOpen: boolean;
	setIsOpen: TooltipProps["onOpenChange"];
	x: MotionValue<number>;
	y: MotionValue<number>;
}

const [LocalTooltipProvider, useTooltip] =
	getStrictContext<TooltipContextType>("TooltipContext");

type TooltipProviderProps = TooltipPrimitive.Provider.Props;

function TooltipProvider(props: TooltipProviderProps) {
	return <TooltipPrimitive.Provider data-slot="tooltip-provider" {...props} />;
}

type TooltipProps = TooltipPrimitive.Root.Props & {
	followCursor?: boolean | "x" | "y";
	followCursorSpringOptions?: SpringOptions;
};

function Tooltip({
	followCursor = false,
	followCursorSpringOptions = FOLLOW_CURSOR_SPRING,
	...props
}: TooltipProps) {
	const [isOpen, setIsOpen] = useControlledState({
		defaultValue: props.defaultOpen,
		onChange: props.onOpenChange,
		value: props.open,
	});
	const x = useMotionValue(0);
	const y = useMotionValue(0);

	return (
		<LocalTooltipProvider
			value={{
				followCursor,
				followCursorSpringOptions,
				isOpen,
				setIsOpen,
				x,
				y,
			}}
		>
			<TooltipPrimitive.Root
				data-slot="tooltip"
				{...props}
				onOpenChange={setIsOpen}
			/>
		</LocalTooltipProvider>
	);
}

type TooltipTriggerProps = TooltipPrimitive.Trigger.Props;

function TooltipTrigger({ onMouseMove, ...props }: TooltipTriggerProps) {
	const { followCursor, x, y } = useTooltip();

	const handleMouseMove = useCallback(
		(event: Parameters<NonNullable<TooltipTriggerProps["onMouseMove"]>>[0]) => {
			onMouseMove?.(event);

			const target = event.currentTarget.getBoundingClientRect();

			if (followCursor === "x" || followCursor === true) {
				const offsetX = event.clientX - target.left;
				x.set((offsetX - target.width / 2) / FOLLOW_DAMPENING);
			}

			if (followCursor === "y" || followCursor === true) {
				const offsetY = event.clientY - target.top;
				y.set((offsetY - target.height / 2) / FOLLOW_DAMPENING);
			}
		},
		[followCursor, onMouseMove, x, y]
	);

	return (
		<TooltipPrimitive.Trigger
			data-slot="tooltip-trigger"
			onMouseMove={handleMouseMove}
			{...props}
		/>
	);
}

type TooltipPortalProps = TooltipPrimitive.Portal.Props;

function TooltipPortal(props: TooltipPortalProps) {
	const { isOpen } = useTooltip();

	return (
		<AnimatePresence>
			{isOpen ? (
				<TooltipPrimitive.Portal
					data-slot="tooltip-portal"
					{...props}
					keepMounted
				/>
			) : null}
		</AnimatePresence>
	);
}

type TooltipPositionerProps = TooltipPrimitive.Positioner.Props;

function TooltipPositioner(props: TooltipPositionerProps) {
	return (
		<TooltipPrimitive.Positioner data-slot="tooltip-positioner" {...props} />
	);
}

type TooltipPopupProps = TooltipPrimitive.Popup.Props & {
	transition?: Transition;
};

function TooltipPopup({
	transition = POPUP_TRANSITION,
	...props
}: TooltipPopupProps) {
	const { followCursor, followCursorSpringOptions, x, y } = useTooltip();
	const reduce = useReducedMotion();
	const translateX = useSpring(x, followCursorSpringOptions);
	const translateY = useSpring(y, followCursorSpringOptions);

	/* render 的函数形态：第一个参数是 Base UI 已经解析好的 HTMLProps（className
	   是 string、style 是 CSSProperties，还带 ref 和它自己的事件处理器），整份
	   展开进去才不会丢定位用的 CSS 变量；第二个参数是 Popup 的 state，
	   state.instant 就是 popup-transition 当年消费的 data-instant，键盘在触发器
	   之间连续移动、焦点转移、dismiss 时为真，此时把时长压成 0 不留拖影。
	   剔掉的四个是 React 与 motion 同名不同签的处理器（照 tsc 的报错逐个试出来
	   的最小集合，多剔会丢掉 Base UI 真要透传的处理器），Base UI 不设置它们。 */
	const renderPopup = useCallback(
		(
			{
				onAnimationStart,
				onDrag,
				onDragEnd,
				onDragStart,
				...renderProps
			}: HTMLProps,
			state: TooltipPrimitive.Popup.State
		) => (
			<motion.div
				{...renderProps}
				animate={{ opacity: 1, scale: 1 }}
				exit={{ opacity: 0, scale: 0.5 }}
				initial={{ opacity: 0, scale: 0.5 }}
				key="tooltip-popup"
				style={{
					...renderProps.style,
					x:
						followCursor === "x" || followCursor === true
							? translateX
							: undefined,
					y:
						followCursor === "y" || followCursor === true
							? translateY
							: undefined,
				}}
				transition={
					reduce || state.instant !== undefined ? INSTANT : transition
				}
			/>
		),
		[followCursor, reduce, transition, translateX, translateY]
	);

	return (
		<TooltipPrimitive.Popup
			data-slot="tooltip-popup"
			{...props}
			render={renderPopup}
		/>
	);
}

type TooltipArrowProps = TooltipPrimitive.Arrow.Props;

function TooltipArrow(props: TooltipArrowProps) {
	return <TooltipPrimitive.Arrow data-slot="tooltip-arrow" {...props} />;
}

export {
	Tooltip,
	TooltipArrow,
	type TooltipArrowProps,
	type TooltipContextType,
	TooltipPopup,
	type TooltipPopupProps,
	TooltipPortal,
	type TooltipPortalProps,
	TooltipPositioner,
	type TooltipPositionerProps,
	type TooltipProps,
	TooltipProvider,
	type TooltipProviderProps,
	TooltipTrigger,
	type TooltipTriggerProps,
	useTooltip,
};

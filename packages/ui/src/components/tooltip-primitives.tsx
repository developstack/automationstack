"use client";

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

"use client";

/* Animate UI 的 base popover primitive（上游 registry/primitives/base/popover），
   vendored 进来。与上游源码的四处出入及其理由与 tooltip-primitives.tsx 同一套
   （包名 / props 类型 / keepMounted 位置 / reduced-motion），不再重复。

   多一条只属于 popover 的：上游把 initialFocus、finalFocus 单独解构出来再显式
   传给 Base UI 的 Popup——那是因为它把其余 props 都甩给了 motion.div，这两个
   Base UI 专有的 props 必须留下。这里 props 整份就交给 Base UI，无需拆。 */

import { useControlledState } from "@automationstack/ui/hooks/use-controlled-state";
import { getStrictContext } from "@automationstack/ui/lib/get-strict-context";
import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import type { HTMLProps } from "@base-ui/react/types";
import {
	AnimatePresence,
	motion,
	type Transition,
	useReducedMotion,
} from "motion/react";
import { useCallback } from "react";

const INSTANT: Transition = { duration: 0 };
const POPUP_TRANSITION: Transition = {
	damping: 25,
	stiffness: 300,
	type: "spring",
};

interface PopoverContextType {
	isOpen: boolean;
	setIsOpen: PopoverProps["onOpenChange"];
}

const [PopoverProvider, usePopover] =
	getStrictContext<PopoverContextType>("PopoverContext");

type PopoverProps = PopoverPrimitive.Root.Props;

function Popover(props: PopoverProps) {
	const [isOpen, setIsOpen] = useControlledState({
		defaultValue: props.defaultOpen,
		onChange: props.onOpenChange,
		value: props.open,
	});

	return (
		<PopoverProvider value={{ isOpen, setIsOpen }}>
			<PopoverPrimitive.Root
				data-slot="popover"
				{...props}
				onOpenChange={setIsOpen}
			/>
		</PopoverProvider>
	);
}

type PopoverTriggerProps = PopoverPrimitive.Trigger.Props;

function PopoverTrigger(props: PopoverTriggerProps) {
	return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />;
}

type PopoverPortalProps = PopoverPrimitive.Portal.Props;

function PopoverPortal(props: PopoverPortalProps) {
	const { isOpen } = usePopover();

	return (
		<AnimatePresence>
			{isOpen ? (
				<PopoverPrimitive.Portal
					data-slot="popover-portal"
					{...props}
					keepMounted
				/>
			) : null}
		</AnimatePresence>
	);
}

type PopoverPositionerProps = PopoverPrimitive.Positioner.Props;

function PopoverPositioner(props: PopoverPositionerProps) {
	return (
		<PopoverPrimitive.Positioner data-slot="popover-positioner" {...props} />
	);
}

type PopoverPopupProps = PopoverPrimitive.Popup.Props & {
	transition?: Transition;
};

function PopoverPopup({
	transition = POPUP_TRANSITION,
	...props
}: PopoverPopupProps) {
	const reduce = useReducedMotion();

	/* render 的函数形态，理由与 tooltip-primitives.tsx 里那段同源：第一个参数是
	   Base UI 解析好的 HTMLProps（含定位用的 CSS 变量、ref 和事件处理器），必须
	   整份展开；第二个参数的 state.instant 就是 popup-transition 当年消费的
	   data-instant。popover 这边的取值是 'dismiss' | 'click' | 'focus' |
	   'trigger-change'，其中 click 只在键盘触发时置位——鼠标点开照常有动画。 */
	const renderPopup = useCallback(
		(
			{
				onAnimationStart,
				onDrag,
				onDragEnd,
				onDragStart,
				...renderProps
			}: HTMLProps,
			state: PopoverPrimitive.Popup.State
		) => (
			<motion.div
				{...renderProps}
				animate={{ opacity: 1, scale: 1 }}
				exit={{ opacity: 0, scale: 0.5 }}
				initial={{ opacity: 0, scale: 0.5 }}
				key="popover-popup"
				transition={
					reduce || state.instant !== undefined ? INSTANT : transition
				}
			/>
		),
		[reduce, transition]
	);

	return (
		<PopoverPrimitive.Popup
			data-slot="popover-popup"
			{...props}
			render={renderPopup}
		/>
	);
}

type PopoverBackdropProps = PopoverPrimitive.Backdrop.Props;

function PopoverBackdrop(props: PopoverBackdropProps) {
	return <PopoverPrimitive.Backdrop data-slot="popover-backdrop" {...props} />;
}

type PopoverArrowProps = PopoverPrimitive.Arrow.Props;

function PopoverArrow(props: PopoverArrowProps) {
	return <PopoverPrimitive.Arrow data-slot="popover-arrow" {...props} />;
}

type PopoverTitleProps = PopoverPrimitive.Title.Props;

function PopoverTitle(props: PopoverTitleProps) {
	return <PopoverPrimitive.Title data-slot="popover-title" {...props} />;
}

type PopoverDescriptionProps = PopoverPrimitive.Description.Props;

function PopoverDescription(props: PopoverDescriptionProps) {
	return (
		<PopoverPrimitive.Description data-slot="popover-description" {...props} />
	);
}

type PopoverCloseProps = PopoverPrimitive.Close.Props;

function PopoverClose(props: PopoverCloseProps) {
	return <PopoverPrimitive.Close data-slot="popover-close" {...props} />;
}

export {
	Popover,
	PopoverArrow,
	type PopoverArrowProps,
	PopoverBackdrop,
	type PopoverBackdropProps,
	PopoverClose,
	type PopoverCloseProps,
	type PopoverContextType,
	PopoverDescription,
	type PopoverDescriptionProps,
	PopoverPopup,
	type PopoverPopupProps,
	PopoverPortal,
	type PopoverPortalProps,
	PopoverPositioner,
	type PopoverPositionerProps,
	type PopoverProps,
	PopoverTitle,
	type PopoverTitleProps,
	PopoverTrigger,
	type PopoverTriggerProps,
	usePopover,
};

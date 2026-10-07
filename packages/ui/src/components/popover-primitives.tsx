"use client";

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

"use client";

import { useControlledState } from "@automationstack/ui/hooks/use-controlled-state";
import { getStrictContext } from "@automationstack/ui/lib/get-strict-context";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import {
	AnimatePresence,
	motion,
	type Transition,
	useReducedMotion,
} from "motion/react";
import type * as React from "react";

const BACKDROP_TRANSITION: Transition = { duration: 0.2, ease: "easeInOut" };
// 退场与减弱动效共用：150ms ease-out，遮罩与弹层同时结束
const SHORT_TRANSITION: Transition = { duration: 0.15, ease: "easeOut" };
const POPUP_TRANSITION: Transition = {
	damping: 25,
	stiffness: 150,
	type: "spring",
};

interface DialogContextType {
	isOpen: boolean;
	setIsOpen: DialogProps["onOpenChange"];
}

const [DialogProvider, useDialog] =
	getStrictContext<DialogContextType>("DialogContext");

type DialogProps = DialogPrimitive.Root.Props;

function Dialog(props: DialogProps) {
	const [isOpen, setIsOpen] = useControlledState({
		defaultValue: props.defaultOpen,
		onChange: props.onOpenChange,
		value: props.open,
	});

	return (
		<DialogProvider value={{ isOpen, setIsOpen }}>
			<DialogPrimitive.Root
				data-slot="dialog"
				{...props}
				onOpenChange={setIsOpen}
			/>
		</DialogProvider>
	);
}

type DialogTriggerProps = DialogPrimitive.Trigger.Props;

function DialogTrigger(props: DialogTriggerProps) {
	return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />;
}

type DialogPortalProps = DialogPrimitive.Portal.Props;

function DialogPortal(props: DialogPortalProps) {
	const { isOpen } = useDialog();

	return (
		<AnimatePresence>
			{isOpen ? (
				<DialogPrimitive.Portal
					data-slot="dialog-portal"
					{...props}
					keepMounted
				/>
			) : null}
		</AnimatePresence>
	);
}

type DialogBackdropProps = DialogPrimitive.Backdrop.Props & {
	transition?: Transition;
};

function DialogBackdrop({
	transition = BACKDROP_TRANSITION,
	...props
}: DialogBackdropProps) {
	const reduce = useReducedMotion();

	return (
		<DialogPrimitive.Backdrop
			data-slot="dialog-backdrop"
			{...props}
			render={
				<motion.div
					animate={
						reduce ? { opacity: 1 } : { filter: "blur(0px)", opacity: 1 }
					}
					exit={
						reduce
							? { opacity: 0 }
							: {
									filter: "blur(4px)",
									opacity: 0,
									transition: SHORT_TRANSITION,
								}
					}
					initial={
						reduce ? { opacity: 0 } : { filter: "blur(4px)", opacity: 0 }
					}
					key="dialog-backdrop"
					transition={reduce ? SHORT_TRANSITION : transition}
				/>
			}
		/>
	);
}

type DialogFlipDirection = "bottom" | "left" | "right" | "top";

type DialogPopupProps = DialogPrimitive.Popup.Props & {
	from?: DialogFlipDirection;
	transition?: Transition;
};

function DialogPopup({
	from = "top",
	transition = POPUP_TRANSITION,
	...props
}: DialogPopupProps) {
	const reduce = useReducedMotion();
	const initialRotation =
		from === "bottom" || from === "left" ? "20deg" : "-20deg";
	const isVertical = from === "top" || from === "bottom";
	const rotateAxis = isVertical ? "rotateX" : "rotateY";
	// 三个状态共用同一变换模板，motion 才能按项插值
	const closed = `perspective(500px) ${rotateAxis}(${initialRotation}) scale(0.8) translateY(0px)`;
	const opened = `perspective(500px) ${rotateAxis}(0deg) scale(1) translateY(0px)`;
	const exited = `perspective(500px) ${rotateAxis}(0deg) scale(1) translateY(-12px)`;

	return (
		<DialogPrimitive.Popup
			data-slot="dialog-popup"
			{...props}
			render={
				<motion.div
					animate={
						reduce
							? { opacity: 1 }
							: { filter: "blur(0px)", opacity: 1, transform: opened }
					}
					exit={
						reduce
							? { opacity: 0 }
							: {
									filter: "blur(4px)",
									opacity: 0,
									transform: exited,
									transition: SHORT_TRANSITION,
								}
					}
					initial={
						reduce
							? { opacity: 0 }
							: { filter: "blur(4px)", opacity: 0, transform: closed }
					}
					key="dialog-popup"
					transition={reduce ? SHORT_TRANSITION : transition}
				/>
			}
		/>
	);
}

type DialogCloseProps = DialogPrimitive.Close.Props;

function DialogClose(props: DialogCloseProps) {
	return <DialogPrimitive.Close data-slot="dialog-close" {...props} />;
}

type DialogHeaderProps = React.ComponentProps<"div">;

function DialogHeader(props: DialogHeaderProps) {
	return <div data-slot="dialog-header" {...props} />;
}

type DialogFooterProps = React.ComponentProps<"div">;

function DialogFooter(props: DialogFooterProps) {
	return <div data-slot="dialog-footer" {...props} />;
}

type DialogTitleProps = DialogPrimitive.Title.Props;

function DialogTitle(props: DialogTitleProps) {
	return <DialogPrimitive.Title data-slot="dialog-title" {...props} />;
}

type DialogDescriptionProps = DialogPrimitive.Description.Props;

function DialogDescription(props: DialogDescriptionProps) {
	return (
		<DialogPrimitive.Description data-slot="dialog-description" {...props} />
	);
}

export {
	Dialog,
	DialogBackdrop,
	type DialogBackdropProps,
	DialogClose,
	type DialogCloseProps,
	type DialogContextType,
	DialogDescription,
	type DialogDescriptionProps,
	type DialogFlipDirection,
	DialogFooter,
	type DialogFooterProps,
	DialogHeader,
	type DialogHeaderProps,
	DialogPopup,
	type DialogPopupProps,
	DialogPortal,
	type DialogPortalProps,
	type DialogProps,
	DialogTitle,
	type DialogTitleProps,
	DialogTrigger,
	type DialogTriggerProps,
	useDialog,
};

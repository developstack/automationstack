"use client";

/* Animate UI 的 base alert-dialog primitive（上游
   registry/primitives/base/alert-dialog），vendored 进来。与上游源码的四处出入
   及其理由与 tooltip-primitives.tsx 同一套（包名 / props 类型 / keepMounted
   位置 / reduced-motion），翻牌动画的写法理由见 dialog-primitives.tsx。

   Base UI 1.7.0 的 alert-dialog 命名空间只自带 Root 与 Trigger，Backdrop /
   Popup / Portal / Close / Title / Description 都是 dialog 那套的再导出，
   类型别名也一样（AlertDialogBackdropProps 就是 DialogBackdropProps）。
   这里仍按 alert-dialog 的命名空间取，读起来才对得上使用处。 */

import { useControlledState } from "@automationstack/ui/hooks/use-controlled-state";
import { getStrictContext } from "@automationstack/ui/lib/get-strict-context";
import { AlertDialog as AlertDialogPrimitive } from "@base-ui/react/alert-dialog";
import {
	AnimatePresence,
	motion,
	type Transition,
	useReducedMotion,
} from "motion/react";
import type * as React from "react";

const INSTANT: Transition = { duration: 0 };
const BACKDROP_TRANSITION: Transition = { duration: 0.2, ease: "easeInOut" };
const POPUP_TRANSITION: Transition = {
	damping: 25,
	stiffness: 150,
	type: "spring",
};

interface AlertDialogContextType {
	isOpen: boolean;
	setIsOpen: AlertDialogProps["onOpenChange"];
}

const [AlertDialogProvider, useAlertDialog] =
	getStrictContext<AlertDialogContextType>("AlertDialogContext");

type AlertDialogProps = AlertDialogPrimitive.Root.Props;

function AlertDialog(props: AlertDialogProps) {
	const [isOpen, setIsOpen] = useControlledState({
		defaultValue: props.defaultOpen,
		onChange: props.onOpenChange,
		value: props.open,
	});

	return (
		<AlertDialogProvider value={{ isOpen, setIsOpen }}>
			<AlertDialogPrimitive.Root
				data-slot="alert-dialog"
				{...props}
				onOpenChange={setIsOpen}
			/>
		</AlertDialogProvider>
	);
}

type AlertDialogTriggerProps = AlertDialogPrimitive.Trigger.Props;

function AlertDialogTrigger(props: AlertDialogTriggerProps) {
	return (
		<AlertDialogPrimitive.Trigger data-slot="alert-dialog-trigger" {...props} />
	);
}

type AlertDialogPortalProps = AlertDialogPrimitive.Portal.Props;

function AlertDialogPortal(props: AlertDialogPortalProps) {
	const { isOpen } = useAlertDialog();

	return (
		<AnimatePresence>
			{isOpen ? (
				<AlertDialogPrimitive.Portal
					data-slot="alert-dialog-portal"
					{...props}
					keepMounted
				/>
			) : null}
		</AnimatePresence>
	);
}

type AlertDialogBackdropProps = AlertDialogPrimitive.Backdrop.Props & {
	transition?: Transition;
};

function AlertDialogBackdrop({
	transition = BACKDROP_TRANSITION,
	...props
}: AlertDialogBackdropProps) {
	const reduce = useReducedMotion();

	return (
		<AlertDialogPrimitive.Backdrop
			data-slot="alert-dialog-backdrop"
			{...props}
			render={
				<motion.div
					animate={{ filter: "blur(0px)", opacity: 1 }}
					exit={{ filter: "blur(4px)", opacity: 0 }}
					initial={{ filter: "blur(4px)", opacity: 0 }}
					key="alert-dialog-backdrop"
					transition={reduce ? INSTANT : transition}
				/>
			}
		/>
	);
}

type AlertDialogFlipDirection = "bottom" | "left" | "right" | "top";

type AlertDialogPopupProps = AlertDialogPrimitive.Popup.Props & {
	from?: AlertDialogFlipDirection;
	transition?: Transition;
};

function AlertDialogPopup({
	from = "top",
	transition = POPUP_TRANSITION,
	...props
}: AlertDialogPopupProps) {
	const reduce = useReducedMotion();
	const initialRotation =
		from === "bottom" || from === "left" ? "20deg" : "-20deg";
	const isVertical = from === "top" || from === "bottom";
	const rotateAxis = isVertical ? "rotateX" : "rotateY";
	const closed = `perspective(500px) ${rotateAxis}(${initialRotation}) scale(0.8)`;

	return (
		<AlertDialogPrimitive.Popup
			data-slot="alert-dialog-popup"
			{...props}
			render={
				<motion.div
					animate={{
						filter: "blur(0px)",
						opacity: 1,
						transform: `perspective(500px) ${rotateAxis}(0deg) scale(1)`,
					}}
					exit={{ filter: "blur(4px)", opacity: 0, transform: closed }}
					initial={{ filter: "blur(4px)", opacity: 0, transform: closed }}
					key="alert-dialog-popup"
					transition={reduce ? INSTANT : transition}
				/>
			}
		/>
	);
}

type AlertDialogCloseProps = AlertDialogPrimitive.Close.Props;

function AlertDialogClose(props: AlertDialogCloseProps) {
	return (
		<AlertDialogPrimitive.Close data-slot="alert-dialog-close" {...props} />
	);
}

type AlertDialogHeaderProps = React.ComponentProps<"div">;

function AlertDialogHeader(props: AlertDialogHeaderProps) {
	return <div data-slot="alert-dialog-header" {...props} />;
}

type AlertDialogFooterProps = React.ComponentProps<"div">;

function AlertDialogFooter(props: AlertDialogFooterProps) {
	return <div data-slot="alert-dialog-footer" {...props} />;
}

type AlertDialogTitleProps = AlertDialogPrimitive.Title.Props;

function AlertDialogTitle(props: AlertDialogTitleProps) {
	return (
		<AlertDialogPrimitive.Title data-slot="alert-dialog-title" {...props} />
	);
}

type AlertDialogDescriptionProps = AlertDialogPrimitive.Description.Props;

function AlertDialogDescription(props: AlertDialogDescriptionProps) {
	return (
		<AlertDialogPrimitive.Description
			data-slot="alert-dialog-description"
			{...props}
		/>
	);
}

export {
	AlertDialog,
	AlertDialogBackdrop,
	type AlertDialogBackdropProps,
	AlertDialogClose,
	type AlertDialogCloseProps,
	type AlertDialogContextType,
	AlertDialogDescription,
	type AlertDialogDescriptionProps,
	type AlertDialogFlipDirection,
	AlertDialogFooter,
	type AlertDialogFooterProps,
	AlertDialogHeader,
	type AlertDialogHeaderProps,
	AlertDialogPopup,
	type AlertDialogPopupProps,
	AlertDialogPortal,
	type AlertDialogPortalProps,
	type AlertDialogProps,
	AlertDialogTitle,
	type AlertDialogTitleProps,
	AlertDialogTrigger,
	type AlertDialogTriggerProps,
	useAlertDialog,
};

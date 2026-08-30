"use client";

/* 与 shadcn 原件的一处刻意偏离：进出场从 tw-animate-css 的关键帧
   （data-open:animate-in / data-closed:animate-out 那一整套）换成
   alert-dialog-primitives.tsx 里 vendored 的 Animate UI primitive，由 motion 驱动。
   关键帧不可打断，退场播到一半再打开会跳回起点重播；motion 的 JS 动画从当前值
   接着走。两套动画不能共存——关键帧会和 motion 抢同一批属性，所以这里连同
   duration-200 一起删掉，只留布局与配色的类。 */

import {
	AlertDialogBackdrop,
	AlertDialog as AlertDialogBase,
	AlertDialogClose,
	AlertDialogDescription as AlertDialogDescriptionBase,
	AlertDialogFooter as AlertDialogFooterBase,
	AlertDialogHeader as AlertDialogHeaderBase,
	AlertDialogPopup,
	AlertDialogPortal as AlertDialogPortalBase,
	AlertDialogTitle as AlertDialogTitleBase,
	AlertDialogTrigger as AlertDialogTriggerBase,
} from "@automationstack/ui/components/alert-dialog-primitives";
import { Button } from "@automationstack/ui/components/button";
import { cn } from "@automationstack/ui/lib/utils";
import type { AlertDialog as AlertDialogPrimitive } from "@base-ui/react/alert-dialog";
import type * as React from "react";

function AlertDialog({ ...props }: AlertDialogPrimitive.Root.Props) {
	return <AlertDialogBase data-slot="alert-dialog" {...props} />;
}

function AlertDialogTrigger({ ...props }: AlertDialogPrimitive.Trigger.Props) {
	return <AlertDialogTriggerBase data-slot="alert-dialog-trigger" {...props} />;
}

function AlertDialogPortal({ ...props }: AlertDialogPrimitive.Portal.Props) {
	return <AlertDialogPortalBase data-slot="alert-dialog-portal" {...props} />;
}

function AlertDialogOverlay({
	className,
	...props
}: AlertDialogPrimitive.Backdrop.Props) {
	return (
		<AlertDialogBackdrop
			className={cn(
				"fixed inset-0 isolate z-50 bg-black/10 supports-backdrop-filter:backdrop-blur-xs",
				className
			)}
			data-slot="alert-dialog-overlay"
			{...props}
		/>
	);
}

function AlertDialogContent({
	className,
	size = "default",
	...props
}: AlertDialogPrimitive.Popup.Props & {
	size?: "default" | "sm";
}) {
	return (
		<AlertDialogPortal>
			<AlertDialogOverlay />
			<AlertDialogPopup
				className={cn(
					"group/alert-dialog-content fixed top-1/2 left-1/2 z-50 grid w-full -translate-x-1/2 -translate-y-1/2 gap-6 rounded-xl bg-popover p-6 text-popover-foreground outline-none ring-1 ring-foreground/10 data-[size=default]:max-w-xs data-[size=sm]:max-w-xs data-[size=default]:sm:max-w-lg",
					className
				)}
				data-size={size}
				data-slot="alert-dialog-content"
				{...props}
			/>
		</AlertDialogPortal>
	);
}

function AlertDialogHeader({
	className,
	...props
}: React.ComponentProps<"div">) {
	return (
		<AlertDialogHeaderBase
			className={cn(
				"grid grid-rows-[auto_1fr] place-items-center gap-1.5 text-center has-data-[slot=alert-dialog-media]:grid-rows-[auto_auto_1fr] has-data-[slot=alert-dialog-media]:gap-x-6 sm:group-data-[size=default]/alert-dialog-content:place-items-start sm:group-data-[size=default]/alert-dialog-content:text-left sm:group-data-[size=default]/alert-dialog-content:has-data-[slot=alert-dialog-media]:grid-rows-[auto_1fr]",
				className
			)}
			data-slot="alert-dialog-header"
			{...props}
		/>
	);
}

function AlertDialogFooter({
	className,
	...props
}: React.ComponentProps<"div">) {
	return (
		<AlertDialogFooterBase
			className={cn(
				"flex flex-col-reverse gap-2 group-data-[size=sm]/alert-dialog-content:grid group-data-[size=sm]/alert-dialog-content:grid-cols-2 sm:flex-row sm:justify-end",
				className
			)}
			data-slot="alert-dialog-footer"
			{...props}
		/>
	);
}

function AlertDialogMedia({
	className,
	...props
}: React.ComponentProps<"div">) {
	return (
		<div
			className={cn(
				"mb-2 inline-flex size-16 items-center justify-center rounded-md bg-muted sm:group-data-[size=default]/alert-dialog-content:row-span-2 *:[svg:not([class*='size-'])]:size-8",
				className
			)}
			data-slot="alert-dialog-media"
			{...props}
		/>
	);
}

function AlertDialogTitle({
	className,
	...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Title>) {
	return (
		<AlertDialogTitleBase
			className={cn(
				"font-medium text-lg sm:group-data-[size=default]/alert-dialog-content:group-has-data-[slot=alert-dialog-media]/alert-dialog-content:col-start-2",
				className
			)}
			data-slot="alert-dialog-title"
			{...props}
		/>
	);
}

function AlertDialogDescription({
	className,
	...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Description>) {
	return (
		<AlertDialogDescriptionBase
			className={cn(
				"text-balance text-muted-foreground text-sm md:text-pretty *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground",
				className
			)}
			data-slot="alert-dialog-description"
			{...props}
		/>
	);
}

function AlertDialogAction({
	className,
	...props
}: React.ComponentProps<typeof Button>) {
	return (
		<Button
			className={cn(className)}
			data-slot="alert-dialog-action"
			{...props}
		/>
	);
}

function AlertDialogCancel({
	className,
	variant = "outline",
	size = "default",
	...props
}: AlertDialogPrimitive.Close.Props &
	Pick<React.ComponentProps<typeof Button>, "variant" | "size">) {
	return (
		<AlertDialogClose
			className={cn(className)}
			data-slot="alert-dialog-cancel"
			render={<Button size={size} variant={variant} />}
			{...props}
		/>
	);
}

export {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogMedia,
	AlertDialogOverlay,
	AlertDialogPortal,
	AlertDialogTitle,
	AlertDialogTrigger,
};

import { Button } from "@automationstack/ui/components/button";
import { cn } from "@automationstack/ui/lib/utils";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { XIcon } from "lucide-react";
import type * as React from "react";

function Dialog({ ...props }: DialogPrimitive.Root.Props) {
	return <DialogPrimitive.Root data-slot="dialog" {...props} />;
}

function DialogTrigger({ ...props }: DialogPrimitive.Trigger.Props) {
	return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />;
}

function DialogPortal({ ...props }: DialogPrimitive.Portal.Props) {
	return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />;
}

function DialogClose({ ...props }: DialogPrimitive.Close.Props) {
	return <DialogPrimitive.Close data-slot="dialog-close" {...props} />;
}

function DialogOverlay({
	className,
	...props
}: DialogPrimitive.Backdrop.Props) {
	return (
		<DialogPrimitive.Backdrop
			className={cn(
				"data-open:fade-in-0 data-closed:fade-out-0 fixed inset-0 isolate z-50 bg-black/10 duration-200 data-closed:animate-out data-open:animate-in supports-backdrop-filter:backdrop-blur-xs",
				className
			)}
			data-slot="dialog-overlay"
			{...props}
		/>
	);
}

function DialogContent({
	className,
	children,
	showCloseButton = true,
	...props
}: DialogPrimitive.Popup.Props & {
	showCloseButton?: boolean;
}) {
	return (
		<DialogPortal>
			<DialogOverlay />
			<DialogPrimitive.Popup
				className={cn(
					"data-open:fade-in-0 data-open:zoom-in-95 data-closed:fade-out-0 data-closed:zoom-out-95 fixed top-1/2 left-1/2 z-50 grid w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-6 rounded-xl bg-popover p-6 text-popover-foreground text-sm outline-none ring-1 ring-foreground/10 duration-200 data-closed:animate-out data-open:animate-in sm:max-w-md",
					className
				)}
				data-slot="dialog-content"
				{...props}
			>
				{children}
				{showCloseButton ? (
					<DialogPrimitive.Close
						data-slot="dialog-close"
						render={
							<Button
								className="absolute top-4 right-4"
								size="icon-sm"
								variant="ghost"
							/>
						}
					>
						<XIcon />
						{/* 未随上游回归：上游是 "Close"。本站 <html lang="zh-CN">，未标记 lang 的英文内容
                命中 WCAG 2.2 SC 3.1.2 Language of Parts（AA），中文读屏用户会听到一个
                英文按钮名。纯文案本地化，不影响与 registry 的结构对齐。 */}
						<span className="sr-only">关闭</span>
					</DialogPrimitive.Close>
				) : null}
			</DialogPrimitive.Popup>
		</DialogPortal>
	);
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			className={cn("flex flex-col gap-2", className)}
			data-slot="dialog-header"
			{...props}
		/>
	);
}

function DialogFooter({
	className,
	showCloseButton = false,
	children,
	...props
}: React.ComponentProps<"div"> & {
	showCloseButton?: boolean;
}) {
	return (
		<div
			className={cn(
				"flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
				className
			)}
			data-slot="dialog-footer"
			{...props}
		>
			{children}
			{showCloseButton ? (
				<DialogPrimitive.Close render={<Button variant="outline" />}>
					{/* 同上：这是可见文案，回归成 "Close" 会在全中文界面里露出英文按钮。 */}
					关闭
				</DialogPrimitive.Close>
			) : null}
		</div>
	);
}

function DialogTitle({ className, ...props }: DialogPrimitive.Title.Props) {
	return (
		<DialogPrimitive.Title
			className={cn("font-medium leading-none", className)}
			data-slot="dialog-title"
			{...props}
		/>
	);
}

function DialogDescription({
	className,
	...props
}: DialogPrimitive.Description.Props) {
	return (
		<DialogPrimitive.Description
			className={cn(
				"text-muted-foreground text-sm *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground",
				className
			)}
			data-slot="dialog-description"
			{...props}
		/>
	);
}

export {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogOverlay,
	DialogPortal,
	DialogTitle,
	DialogTrigger,
};

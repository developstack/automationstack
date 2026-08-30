/* 与 shadcn 原件的一处刻意偏离：进出场从 tw-animate-css 的关键帧
   （data-open:animate-in / data-closed:animate-out 那一整套）换成
   dialog-primitives.tsx 里 vendored 的 Animate UI primitive，由 motion 驱动。
   关键帧不可打断，退场播到一半再打开会跳回起点重播；motion 的 JS 动画从当前值
   接着走。两套动画不能共存——关键帧会和 motion 抢同一批属性，所以这里连同
   duration-200 一起删掉，只留布局与配色的类。 */

import { Button } from "@automationstack/ui/components/button";
import {
	DialogBackdrop,
	Dialog as DialogBase,
	DialogClose as DialogCloseBase,
	DialogDescription as DialogDescriptionBase,
	DialogFooter as DialogFooterBase,
	DialogHeader as DialogHeaderBase,
	DialogPopup,
	DialogPortal as DialogPortalBase,
	DialogTitle as DialogTitleBase,
	DialogTrigger as DialogTriggerBase,
} from "@automationstack/ui/components/dialog-primitives";
import { cn } from "@automationstack/ui/lib/utils";
import type { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { XIcon } from "lucide-react";
import type * as React from "react";

function Dialog({ ...props }: DialogPrimitive.Root.Props) {
	return <DialogBase data-slot="dialog" {...props} />;
}

function DialogTrigger({ ...props }: DialogPrimitive.Trigger.Props) {
	return <DialogTriggerBase data-slot="dialog-trigger" {...props} />;
}

function DialogPortal({ ...props }: DialogPrimitive.Portal.Props) {
	return <DialogPortalBase data-slot="dialog-portal" {...props} />;
}

function DialogClose({ ...props }: DialogPrimitive.Close.Props) {
	return <DialogCloseBase data-slot="dialog-close" {...props} />;
}

function DialogOverlay({
	className,
	...props
}: DialogPrimitive.Backdrop.Props) {
	return (
		<DialogBackdrop
			className={cn(
				"fixed inset-0 isolate z-50 bg-black/10 supports-backdrop-filter:backdrop-blur-xs",
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
			<DialogPopup
				className={cn(
					"fixed top-1/2 left-1/2 z-50 grid w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-6 rounded-xl bg-popover p-6 text-popover-foreground text-sm outline-none ring-1 ring-foreground/10 sm:max-w-md",
					className
				)}
				data-slot="dialog-content"
				{...props}
			>
				{children}
				{showCloseButton ? (
					<DialogCloseBase
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
					</DialogCloseBase>
				) : null}
			</DialogPopup>
		</DialogPortal>
	);
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<DialogHeaderBase
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
		<DialogFooterBase
			className={cn(
				"flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
				className
			)}
			data-slot="dialog-footer"
			{...props}
		>
			{children}
			{showCloseButton ? (
				<DialogCloseBase render={<Button variant="outline" />}>
					{/* 同上：这是可见文案，回归成 "Close" 会在全中文界面里露出英文按钮。 */}
					关闭
				</DialogCloseBase>
			) : null}
		</DialogFooterBase>
	);
}

function DialogTitle({ className, ...props }: DialogPrimitive.Title.Props) {
	return (
		<DialogTitleBase
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
		<DialogDescriptionBase
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

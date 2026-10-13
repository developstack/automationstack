import {
	Popover as PopoverBase,
	PopoverDescription as PopoverDescriptionBase,
	PopoverPopup,
	PopoverPortal,
	PopoverPositioner,
	PopoverTitle as PopoverTitleBase,
	PopoverTrigger as PopoverTriggerBase,
} from "@automationstack/ui/components/popover-primitives";
import { cn } from "@automationstack/ui/lib/utils";
import type { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import type * as React from "react";

function Popover({ ...props }: PopoverPrimitive.Root.Props) {
	return <PopoverBase data-slot="popover" {...props} />;
}

function PopoverTrigger({ ...props }: PopoverPrimitive.Trigger.Props) {
	return <PopoverTriggerBase data-slot="popover-trigger" {...props} />;
}

function PopoverContent({
	className,
	align = "center",
	alignOffset = 0,
	side = "bottom",
	sideOffset = 4,
	...props
}: PopoverPrimitive.Popup.Props &
	Pick<
		PopoverPrimitive.Positioner.Props,
		"align" | "alignOffset" | "side" | "sideOffset"
	>) {
	return (
		<PopoverPortal>
			<PopoverPositioner
				align={align}
				alignOffset={alignOffset}
				className="isolate z-50"
				side={side}
				sideOffset={sideOffset}
			>
				<PopoverPopup
					className={cn(
						"z-50 flex w-72 origin-(--transform-origin) flex-col gap-4 rounded-md bg-popover p-4 text-popover-foreground text-sm shadow-popover outline-hidden ring-1 ring-foreground/10",
						className
					)}
					data-slot="popover-content"
					{...props}
				/>
			</PopoverPositioner>
		</PopoverPortal>
	);
}

function PopoverHeader({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			className={cn("flex flex-col gap-1 text-sm", className)}
			data-slot="popover-header"
			{...props}
		/>
	);
}

function PopoverTitle({ className, ...props }: PopoverPrimitive.Title.Props) {
	return (
		<PopoverTitleBase
			className={cn("font-medium", className)}
			data-slot="popover-title"
			{...props}
		/>
	);
}

function PopoverDescription({
	className,
	...props
}: PopoverPrimitive.Description.Props) {
	return (
		<PopoverDescriptionBase
			className={cn("text-muted-foreground", className)}
			data-slot="popover-description"
			{...props}
		/>
	);
}

export {
	Popover,
	PopoverContent,
	PopoverDescription,
	PopoverHeader,
	PopoverTitle,
	PopoverTrigger,
};

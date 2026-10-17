"use client";

import {
	TooltipArrow,
	Tooltip as TooltipBase,
	TooltipPopup,
	TooltipPortal,
	TooltipPositioner,
	TooltipProvider as TooltipProviderBase,
	TooltipTrigger as TooltipTriggerBase,
} from "@automationstack/ui/components/tooltip-primitives";
import { cn } from "@automationstack/ui/lib/utils";
import type { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip";

function TooltipProvider({
	delay = 0,
	...props
}: TooltipPrimitive.Provider.Props) {
	return (
		<TooltipProviderBase
			data-slot="tooltip-provider"
			delay={delay}
			{...props}
		/>
	);
}

function Tooltip({ ...props }: TooltipPrimitive.Root.Props) {
	return <TooltipBase data-slot="tooltip" {...props} />;
}

function TooltipTrigger({ ...props }: TooltipPrimitive.Trigger.Props) {
	return <TooltipTriggerBase data-slot="tooltip-trigger" {...props} />;
}

function TooltipContent({
	className,
	side = "top",
	sideOffset = 4,
	align = "center",
	alignOffset = 0,
	children,
	...props
}: TooltipPrimitive.Popup.Props &
	Pick<
		TooltipPrimitive.Positioner.Props,
		"align" | "alignOffset" | "side" | "sideOffset"
	>) {
	return (
		<TooltipPortal>
			<TooltipPositioner
				align={align}
				alignOffset={alignOffset}
				className="isolate z-50"
				side={side}
				sideOffset={sideOffset}
			>
				<TooltipPopup
					className={cn(
						"z-50 inline-flex w-fit max-w-xs origin-(--transform-origin) items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-background text-xs has-data-[slot=kbd]:pr-1.5 **:data-[slot=kbd]:relative **:data-[slot=kbd]:isolate **:data-[slot=kbd]:z-50 **:data-[slot=kbd]:rounded-sm",
						className
					)}
					data-slot="tooltip-content"
					{...props}
				>
					{children}
					<TooltipArrow className="z-50 size-2.5 translate-y-[calc(-50%-2px)] rotate-45 rounded-xs bg-foreground fill-foreground data-[side=bottom]:top-1 data-[side=inline-end]:top-1/2! data-[side=inline-start]:top-1/2! data-[side=left]:top-1/2! data-[side=right]:top-1/2! data-[side=inline-start]:-right-1 data-[side=left]:-right-1 data-[side=top]:-bottom-2.5 data-[side=inline-end]:-left-1 data-[side=right]:-left-1 data-[side=inline-end]:-translate-y-1/2 data-[side=inline-start]:-translate-y-1/2 data-[side=left]:-translate-y-1/2 data-[side=right]:-translate-y-1/2" />
				</TooltipPopup>
			</TooltipPositioner>
		</TooltipPortal>
	);
}

export { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger };

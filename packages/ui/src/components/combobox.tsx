import { cn } from "@automationstack/ui/lib/utils";
import { Combobox as ComboboxPrimitive } from "@base-ui/react/combobox";
import { CheckIcon } from "lucide-react";

const Combobox = ComboboxPrimitive.Root;

function ComboboxInput({ className, ...props }: ComboboxPrimitive.Input.Props) {
	return (
		<ComboboxPrimitive.Input
			className={cn(
				"h-8 w-full min-w-0 rounded-md border border-input bg-transparent px-2.5 py-1 text-base shadow-xs outline-none transition-[color,box-shadow] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
				className
			)}
			data-slot="combobox-input"
			{...props}
		/>
	);
}

function ComboboxContent({
	className,
	children,
	side = "bottom",
	sideOffset = 4,
	align = "start",
	alignOffset = 0,
	...props
}: ComboboxPrimitive.Popup.Props &
	Pick<
		ComboboxPrimitive.Positioner.Props,
		"align" | "alignOffset" | "side" | "sideOffset"
	>) {
	return (
		<ComboboxPrimitive.Portal>
			<ComboboxPrimitive.Positioner
				align={align}
				alignOffset={alignOffset}
				className="isolate z-50"
				side={side}
				sideOffset={sideOffset}
			>
				<ComboboxPrimitive.Popup
					className={cn(
						"popup-transition relative isolate z-50 max-h-(--available-height) w-(--anchor-width) min-w-36 origin-(--transform-origin) overflow-y-auto overflow-x-hidden overscroll-contain rounded-md bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10",
						className
					)}
					data-slot="combobox-content"
					{...props}
				>
					<ComboboxPrimitive.List className="p-1" data-slot="combobox-list">
						{children}
					</ComboboxPrimitive.List>
				</ComboboxPrimitive.Popup>
			</ComboboxPrimitive.Positioner>
		</ComboboxPrimitive.Portal>
	);
}

function ComboboxItem({
	className,
	children,
	...props
}: ComboboxPrimitive.Item.Props) {
	return (
		<ComboboxPrimitive.Item
			className={cn(
				"relative flex w-full cursor-default select-none items-center gap-2 rounded-sm py-1.5 ps-2 pe-8 text-sm outline-hidden data-disabled:pointer-events-none data-highlighted:bg-accent data-highlighted:text-accent-foreground data-disabled:opacity-50",
				className
			)}
			data-slot="combobox-item"
			{...props}
		>
			<span className="flex flex-1 shrink-0 gap-2 whitespace-nowrap">
				{children}
			</span>
			<ComboboxPrimitive.ItemIndicator
				render={
					<span className="pointer-events-none absolute right-2 flex size-4 items-center justify-center" />
				}
			>
				<CheckIcon className="pointer-events-none" />
			</ComboboxPrimitive.ItemIndicator>
		</ComboboxPrimitive.Item>
	);
}

function ComboboxEmpty({ className, ...props }: ComboboxPrimitive.Empty.Props) {
	return (
		<ComboboxPrimitive.Empty
			className={cn("px-2 py-1.5 text-muted-foreground text-xs", className)}
			data-slot="combobox-empty"
			{...props}
		/>
	);
}

type ComboboxChangeEventDetails = ComboboxPrimitive.Root.ChangeEventDetails;

export {
	Combobox,
	type ComboboxChangeEventDetails,
	ComboboxContent,
	ComboboxEmpty,
	ComboboxInput,
	ComboboxItem,
};

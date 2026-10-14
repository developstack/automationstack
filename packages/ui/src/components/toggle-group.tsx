"use client";

// 来源：shadcn registry 的 base-vega/toggle-group。新增 segmented 变体：灰色底槽中的一组分段按钮
import { toggleVariants } from "@automationstack/ui/components/toggle";
import { cn } from "@automationstack/ui/lib/utils";
import { Toggle as TogglePrimitive } from "@base-ui/react/toggle";
import { ToggleGroup as ToggleGroupPrimitive } from "@base-ui/react/toggle-group";
import type { VariantProps } from "class-variance-authority";
import { createContext, useContext } from "react";

type ToggleGroupVariants = VariantProps<typeof toggleVariants>;

const ToggleGroupContext = createContext<ToggleGroupVariants>({
	size: "default",
	variant: "default",
});

const GROUP_VARIANT_CLASSES = {
	default: "gap-1",
	outline: "gap-1",
	segmented: "gap-0.5 rounded-lg bg-muted p-0.5",
} as const;

function ToggleGroup({
	className,
	variant,
	size,
	children,
	...props
}: ToggleGroupPrimitive.Props & ToggleGroupVariants) {
	return (
		<ToggleGroupPrimitive
			className={cn(
				"group/toggle-group flex w-fit flex-row items-center rounded-md data-vertical:flex-col data-vertical:items-stretch",
				GROUP_VARIANT_CLASSES[variant ?? "default"],
				className
			)}
			data-size={size}
			data-slot="toggle-group"
			data-variant={variant}
			{...props}
		>
			<ToggleGroupContext.Provider value={{ size, variant }}>
				{children}
			</ToggleGroupContext.Provider>
		</ToggleGroupPrimitive>
	);
}

function ToggleGroupItem({
	className,
	children,
	variant = "default",
	size = "default",
	...props
}: TogglePrimitive.Props & ToggleGroupVariants) {
	const context = useContext(ToggleGroupContext);
	const resolvedVariant = context.variant ?? variant;
	const resolvedSize = context.size ?? size;

	return (
		<TogglePrimitive
			className={cn(
				"shrink-0 focus:z-10 focus-visible:z-10",
				toggleVariants({ size: resolvedSize, variant: resolvedVariant }),
				className
			)}
			data-size={resolvedSize}
			data-slot="toggle-group-item"
			data-variant={resolvedVariant}
			{...props}
		>
			{children}
		</TogglePrimitive>
	);
}

export { ToggleGroup, ToggleGroupItem };

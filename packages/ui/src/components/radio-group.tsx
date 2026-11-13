"use client";

// 来源：shadcn registry 的 radio-group（Base UI 版本）
import { cn } from "@automationstack/ui/lib/utils";
import { Radio as RadioPrimitive } from "@base-ui/react/radio";
import { RadioGroup as RadioGroupPrimitive } from "@base-ui/react/radio-group";

function RadioGroup({ className, ...props }: RadioGroupPrimitive.Props) {
	return (
		<RadioGroupPrimitive
			className={cn("grid w-full gap-2", className)}
			data-slot="radio-group"
			{...props}
		/>
	);
}

function RadioGroupItem({ className, ...props }: RadioPrimitive.Root.Props) {
	return (
		<RadioPrimitive.Root
			className={cn(
				"peer relative flex aspect-square size-4 shrink-0 rounded-full border border-input outline-none after:absolute after:-inset-x-3 after:-inset-y-2 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 data-disabled:cursor-not-allowed data-checked:border-primary data-checked:bg-primary data-disabled:opacity-50 dark:bg-input/30 dark:data-checked:bg-primary dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
				className
			)}
			data-slot="radio-group-item"
			{...props}
		>
			<RadioPrimitive.Indicator
				className="flex size-full items-center justify-center"
				data-slot="radio-group-indicator"
			>
				<span className="size-2 rounded-full bg-primary-foreground" />
			</RadioPrimitive.Indicator>
		</RadioPrimitive.Root>
	);
}

export { RadioGroup, RadioGroupItem };

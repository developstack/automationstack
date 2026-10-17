"use client";

import {
	Checkbox as CheckboxBase,
	CheckboxIndicator,
} from "@automationstack/ui/components/checkbox-primitives";
import { cn } from "@automationstack/ui/lib/utils";
import type { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox";

function Checkbox({ className, ...props }: CheckboxPrimitive.Root.Props) {
	return (
		<CheckboxBase
			className={cn(
				"peer relative flex size-4 shrink-0 items-center justify-center rounded-sm border border-input shadow-xs outline-none transition-shadow after:absolute after:-inset-x-3 after:-inset-y-2 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 group-has-[:focus-visible]/field-label:not-data-checked:border-input group-has-disabled/field:opacity-50 group-has-[:focus-visible]/field-label:ring-0 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 aria-invalid:aria-checked:border-primary data-checked:border-primary data-indeterminate:border-primary data-checked:bg-primary data-indeterminate:bg-primary data-checked:text-primary-foreground data-indeterminate:text-primary-foreground group-has-[:focus-visible]/field-label:data-checked:border-primary dark:bg-input/30 dark:data-checked:bg-primary dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
				className
			)}
			data-slot="checkbox"
			{...props}
		>
			<CheckboxIndicator
				className="size-3.5 text-current"
				data-slot="checkbox-indicator"
			/>
		</CheckboxBase>
	);
}

export { Checkbox };

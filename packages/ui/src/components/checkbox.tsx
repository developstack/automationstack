"use client";

/* 勾从 lucide 的 CheckIcon 换成 checkbox-primitives.tsx 里 vendored 的
   Animate UI primitive：它用 motion 按 pathLength 把勾画出来 / 收回去，
   indeterminate 则画一条横线（原来这一态是没有任何指示符的）。
   原先指示符上的 transition-none 是为了压住 CSS 过渡，现在动画归 motion 管，
   这个类没有对象可压，一并去掉。 */

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
				"peer relative flex size-4 shrink-0 items-center justify-center rounded-[4px] border border-input shadow-xs outline-none transition-shadow after:absolute after:-inset-x-3 after:-inset-y-2 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 group-has-[:focus-visible]/field-label:not-data-checked:border-input group-has-disabled/field:opacity-50 group-has-[:focus-visible]/field-label:ring-0 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 aria-invalid:aria-checked:border-primary data-checked:border-primary data-checked:bg-primary data-checked:text-primary-foreground group-has-[:focus-visible]/field-label:data-checked:border-primary dark:bg-input/30 dark:data-checked:bg-primary dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
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

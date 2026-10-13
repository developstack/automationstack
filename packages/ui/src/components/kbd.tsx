// 来源：shadcn registry 的 kbd。本地修改：只保留 Kbd，去掉 KbdGroup 和 tooltip 中的样式
import { cn } from "@automationstack/ui/lib/utils";
import type * as React from "react";

function Kbd({ className, ...props }: React.ComponentProps<"kbd">) {
	return (
		<kbd
			className={cn(
				"pointer-events-none inline-flex h-5 w-fit min-w-5 select-none items-center justify-center gap-1 rounded-sm bg-muted px-1 font-medium font-sans text-muted-foreground text-xs [&_svg:not([class*='size-'])]:size-3",
				className
			)}
			data-slot="kbd"
			{...props}
		/>
	);
}

export { Kbd };

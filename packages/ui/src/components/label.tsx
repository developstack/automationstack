"use client";

import { cn } from "@automationstack/ui/lib/utils";
import type * as React from "react";

function Label({ className, ...props }: React.ComponentProps<"label">) {
	return (
		// 本仓库的 lint 基线开了 a11y/noLabelWithoutControl，而 shadcn 原件是纯壳，
		// htmlFor / 被包裹的控件都由调用方通过 props 传入，这里无从静态判定。
		// biome-ignore lint/a11y/noLabelWithoutControl: htmlFor 由调用方通过 props 传入
		<label
			className={cn(
				"flex select-none items-center gap-2 font-medium text-sm leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-50 group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50",
				className
			)}
			data-slot="label"
			{...props}
		/>
	);
}

export { Label };

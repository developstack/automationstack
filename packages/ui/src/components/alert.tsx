// 来源：shadcn registry 的 base-vega/alert。本地修改：新增 warning 和 muted 变体，
// 新增 AlertActions（标题和说明下面的操作按钮行），去掉 AlertAction（右上角的操作）；
// destructive 和 warning 使用 *-soft 令牌，浅色和暗色模式的文字对比度都达到 WCAG AA
import { cn } from "@automationstack/ui/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";

const alertVariants = cva(
	"group/alert relative grid w-full gap-0.5 rounded-lg border px-3 py-2.5 text-left text-sm has-[>svg]:grid-cols-[auto_1fr] has-[>svg]:gap-x-2 *:[svg:not([class*='size-'])]:size-4 *:[svg]:row-span-3 *:[svg]:translate-y-0.5 *:[svg]:text-current",
	{
		defaultVariants: {
			variant: "default",
		},
		variants: {
			variant: {
				default: "bg-card text-card-foreground",
				destructive:
					"border-destructive/30 bg-destructive-soft text-destructive-soft-foreground *:data-[slot=alert-description]:text-destructive-soft-foreground",
				muted:
					"border-transparent bg-muted text-foreground *:data-[slot=alert-description]:text-muted-foreground",
				warning:
					"border-warning/30 bg-warning-soft text-warning-soft-foreground *:data-[slot=alert-description]:text-warning-soft-foreground",
			},
		},
	}
);

function Alert({
	className,
	variant,
	...props
}: React.ComponentProps<"div"> & VariantProps<typeof alertVariants>) {
	return (
		<div
			className={cn(alertVariants({ variant }), className)}
			data-slot="alert"
			role="alert"
			{...props}
		/>
	);
}

function AlertTitle({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			className={cn(
				"font-medium group-has-[>svg]/alert:col-start-2",
				className
			)}
			data-slot="alert-title"
			{...props}
		/>
	);
}

function AlertDescription({
	className,
	...props
}: React.ComponentProps<"div">) {
	return (
		<div
			className={cn(
				"text-muted-foreground text-sm group-has-[>svg]/alert:col-start-2 [&_p:not(:last-child)]:mb-2",
				className
			)}
			data-slot="alert-description"
			{...props}
		/>
	);
}

/** 提示中的操作按钮行，放在标题和说明下面。 */
function AlertActions({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			className={cn(
				"flex flex-wrap items-center gap-2 pt-1.5 group-has-[>svg]/alert:col-start-2",
				className
			)}
			data-slot="alert-actions"
			{...props}
		/>
	);
}

export { Alert, AlertActions, AlertDescription, AlertTitle, alertVariants };

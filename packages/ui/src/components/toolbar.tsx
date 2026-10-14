"use client";

// 来源：Base UI 的 Toolbar（shadcn registry 没有 toolbar）。本地修改：按钮使用 buttonVariants，
// 分隔线与 Separator 相同。Base UI 处理左右方向键的焦点移动，不能点击的按钮仍然可以获得焦点
import { buttonVariants } from "@automationstack/ui/components/button";
import { cn } from "@automationstack/ui/lib/utils";
import { Toolbar as ToolbarPrimitive } from "@base-ui/react/toolbar";
import type { VariantProps } from "class-variance-authority";

type ToolbarProps = Omit<ToolbarPrimitive.Root.Props, "className"> & {
	className?: string;
};

function Toolbar({ className, ...props }: ToolbarProps) {
	return (
		<ToolbarPrimitive.Root
			className={cn("flex items-center gap-0.5", className)}
			data-slot="toolbar"
			{...props}
		/>
	);
}

type ToolbarButtonProps = Omit<ToolbarPrimitive.Button.Props, "className"> &
	VariantProps<typeof buttonVariants> & { className?: string };

function ToolbarButton({
	className,
	size = "icon-sm",
	variant = "ghost",
	...props
}: ToolbarButtonProps) {
	return (
		<ToolbarPrimitive.Button
			className={cn(buttonVariants({ size, variant }), className)}
			data-slot="toolbar-button"
			{...props}
		/>
	);
}

type ToolbarSeparatorProps = Omit<
	ToolbarPrimitive.Separator.Props,
	"className"
> & { className?: string };

function ToolbarSeparator({ className, ...props }: ToolbarSeparatorProps) {
	return (
		<ToolbarPrimitive.Separator
			className={cn("mx-1 h-4 w-px shrink-0 self-center bg-border", className)}
			data-slot="toolbar-separator"
			{...props}
		/>
	);
}

export { Toolbar, ToolbarButton, ToolbarSeparator };

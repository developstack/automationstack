import { cn } from "@automationstack/ui/lib/utils";
import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2Icon } from "lucide-react";

const buttonVariants = cva(
	"group/button inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap rounded-md border border-transparent bg-clip-padding font-medium text-sm outline-none transition-control focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-disabled:cursor-not-allowed aria-disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
	{
		// link 变体是行内文字链接，按压缩放会显得突兀，不加 press-scale
		compoundVariants: [
			{
				class: "press-scale",
				variant: ["default", "destructive", "ghost", "outline", "secondary"],
			},
		],
		defaultVariants: {
			size: "default",
			variant: "default",
		},
		variants: {
			size: {
				default:
					"h-8 gap-1.5 in-data-[slot=button-group]:rounded-md px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
				icon: "size-8",
				"icon-lg": "size-9",
				"icon-sm": "size-7 in-data-[slot=button-group]:rounded-md",
				"icon-xs":
					"size-6 in-data-[slot=button-group]:rounded-md [&_svg:not([class*='size-'])]:size-3",
				lg: "h-9 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
				sm: "h-7 gap-1 in-data-[slot=button-group]:rounded-md px-2.5 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5",
				xs: "h-6 gap-1 in-data-[slot=button-group]:rounded-md px-2 text-xs has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
			},
			variant: {
				default: "bg-primary text-primary-foreground hover:bg-primary/80",
				destructive:
					"bg-destructive/10 text-destructive hover:bg-destructive/20 dark:bg-destructive/20 dark:hover:bg-destructive/30",
				ghost:
					"hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:hover:bg-muted/50",
				link: "text-primary underline-offset-4 hover:underline",
				outline:
					"border-border bg-card shadow-xs hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50",
				secondary:
					"bg-secondary text-secondary-foreground hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)] aria-expanded:bg-secondary aria-expanded:text-secondary-foreground",
			},
		},
	}
);

type ButtonProps = ButtonPrimitive.Props &
	VariantProps<typeof buttonVariants> & {
		/**
		 * 提交中：显示加载图标，按钮不能再次点击。
		 * 按钮仍可聚焦，焦点不会在提交时丢失。
		 */
		pending?: boolean;
	};

function Button({
	className,
	variant = "default",
	size = "default",
	pending = false,
	disabled,
	children,
	...props
}: ButtonProps) {
	return (
		<ButtonPrimitive
			aria-busy={pending ? true : undefined}
			className={cn(
				buttonVariants({ className, size, variant }),
				pending &&
					"aria-disabled:cursor-progress [&_[data-icon=inline-start]:not([data-slot=button-spinner])]:hidden"
			)}
			data-pending={pending ? "" : undefined}
			data-slot="button"
			disabled={pending || disabled}
			focusableWhenDisabled={pending ? true : undefined}
			{...props}
		>
			{pending ? (
				<Loader2Icon
					aria-hidden="true"
					className="animate-spin motion-reduce:animate-none"
					data-icon="inline-start"
					data-slot="button-spinner"
				/>
			) : null}
			{children}
		</ButtonPrimitive>
	);
}

export { Button, buttonVariants };

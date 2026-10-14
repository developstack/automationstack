"use client";

// 来源：shadcn registry 的 base-vega/toggle。控件高度按 plans/010 降一档，新增 segmented 变体
import { cn } from "@automationstack/ui/lib/utils";
import { Toggle as TogglePrimitive } from "@base-ui/react/toggle";
import { cva, type VariantProps } from "class-variance-authority";

const toggleVariants = cva(
	"group/toggle inline-flex select-none items-center justify-center gap-1 whitespace-nowrap rounded-md font-medium text-sm outline-none transition-control hover:bg-muted hover:text-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
	{
		defaultVariants: {
			size: "default",
			variant: "default",
		},
		variants: {
			size: {
				default:
					"h-8 min-w-8 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
				lg: "h-9 min-w-9 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
				sm: "h-7 min-w-7 px-2 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5",
			},
			variant: {
				default: "bg-transparent data-pressed:bg-muted",
				outline:
					"border border-input bg-transparent shadow-xs hover:bg-muted data-pressed:bg-muted",
				// 分段控件中的一项：按下的一项是浮起的卡片色，其他项是灰色文字
				segmented:
					"text-muted-foreground hover:bg-transparent data-pressed:bg-card data-pressed:text-foreground data-pressed:shadow-xs dark:data-pressed:bg-input/50",
			},
		},
	}
);

function Toggle({
	className,
	variant = "default",
	size = "default",
	...props
}: TogglePrimitive.Props & VariantProps<typeof toggleVariants>) {
	return (
		<TogglePrimitive
			className={cn(toggleVariants({ className, size, variant }))}
			data-slot="toggle"
			{...props}
		/>
	);
}

export { Toggle, toggleVariants };

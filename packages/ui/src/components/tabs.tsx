import {
	TabsList as TabsListPrimitive,
	TabsPanel,
	Tabs as TabsRoot,
	TabsTab,
} from "@automationstack/ui/components/tabs-primitives";
import { cn } from "@automationstack/ui/lib/utils";
import type { Tabs as TabsPrimitive } from "@base-ui/react/tabs";
import { cva, type VariantProps } from "class-variance-authority";

/**
 * Base UI Tabs 实现的是 ARIA APG 的 tabs 模式：roving tabindex、方向键导航，
 * 以及 aria-selected / aria-controls / aria-labelledby 的连线都由原语负责。
 * 调用方不要再手写这些属性——重复声明会与原语生成的值打架，读屏会念两遍。
 *
 * 选中态的底色从「每个 trigger 各自 data-active:bg-background」换成了一块在标签
 * 之间滑过去的共享高亮（tabs-primitives.tsx → effects-highlight.tsx，motion 的
 * spring，可打断：滑到一半改选会带着当前位置与速度改道，不会跳回起点重播）。
 * 它是绝对定位在 tab 条内部的兄弟节点，靠 DOM 顺序垫在按钮下面，不多加任何元素。
 */
function Tabs({
	className,
	orientation = "horizontal",
	...props
}: TabsPrimitive.Root.Props) {
	return (
		<TabsRoot
			className={cn(
				"group/tabs flex gap-2 data-horizontal:flex-col",
				className
			)}
			data-orientation={orientation}
			data-slot="tabs"
			{...props}
		/>
	);
}

const tabsListVariants = cva(
	"group/tabs-list inline-flex w-fit items-center justify-center rounded-lg p-[3px] text-muted-foreground data-[variant=line]:rounded-none group-data-horizontal/tabs:h-8 group-data-vertical/tabs:h-fit group-data-vertical/tabs:flex-col",
	{
		defaultVariants: {
			variant: "default",
		},
		variants: {
			variant: {
				default: "bg-muted",
				line: "gap-1 bg-transparent",
			},
		},
	}
);

/**
 * line 变体把高亮块整个关掉（highlightEnabled={false}）：它的选中态是一条下划线
 * （trigger 上的 `after:`），不需要底色。关掉时 Highlight 会原样吐出 children，
 * 既不加容器也不改 className，DOM 与迁移前完全一致。
 */
function TabsList({
	className,
	variant = "default",
	...props
}: TabsPrimitive.List.Props & VariantProps<typeof tabsListVariants>) {
	return (
		<TabsListPrimitive
			className={cn(tabsListVariants({ variant }), className)}
			data-slot="tabs-list"
			data-variant={variant}
			highlightClassName="rounded-md border border-transparent bg-background shadow-sm dark:border-input dark:bg-input/30"
			highlightEnabled={variant === "default"}
			{...props}
		/>
	);
}

function TabsTrigger({ className, ...props }: TabsPrimitive.Tab.Props) {
	return (
		<TabsTab
			className={cn(
				"relative inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-transparent px-2 py-1 font-medium text-foreground/60 text-sm transition-all hover:text-foreground focus-visible:border-ring focus-visible:outline-1 focus-visible:outline-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 aria-disabled:pointer-events-none aria-disabled:opacity-50 group-data-vertical/tabs:w-full group-data-vertical/tabs:justify-start dark:text-muted-foreground dark:hover:text-foreground [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
				"data-active:text-foreground dark:data-active:text-foreground",
				"after:absolute after:bg-foreground after:opacity-0 after:transition-opacity group-data-horizontal/tabs:after:inset-x-0 group-data-vertical/tabs:after:inset-y-0 group-data-vertical/tabs:after:-right-1 group-data-horizontal/tabs:after:bottom-[-5px] group-data-horizontal/tabs:after:h-0.5 group-data-vertical/tabs:after:w-0.5 group-data-[variant=line]/tabs-list:data-active:after:opacity-100",
				className
			)}
			data-slot="tabs-trigger"
			{...props}
		/>
	);
}

function TabsContent({ className, ...props }: TabsPrimitive.Panel.Props) {
	return (
		<TabsPanel
			className={cn("flex-1 text-sm outline-none", className)}
			data-slot="tabs-content"
			{...props}
		/>
	);
}

export { Tabs, TabsContent, TabsList, TabsTrigger, tabsListVariants };

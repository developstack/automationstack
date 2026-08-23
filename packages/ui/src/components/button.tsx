/* 与 shadcn registry 的一处偏离：整条尺寸台阶统一下调一档。
   registry 原值 —— default h-9(36) / sm h-8(32) / lg h-10(40) /
   icon size-9(36) / icon-sm size-8(32) / icon-lg size-10(40)；
   本仓库新值 —— default h-8(32) / sm h-7(28) / lg h-9(36) /
   icon size-8(32) / icon-sm size-7(28) / icon-lg size-9(36)。

   理由是信息密度：这是一个以数据表格与树形导航为主的内部工具，一屏里筛选栏、
   数据行、模块树是并排堆着看的，registry 那套疏密是按消费级落地页调的，
   落到这里等于每一行都在替按钮让出高度。同档的尺寸源必须一起降，否则会有两档
   撞到同一像素值：input.tsx 的 h-9/file:h-7、select.tsx 的
   data-[size=default]:h-9 与 data-[size=sm]:h-8、tabs.tsx 的
   group-data-horizontal/tabs:h-9。

   xs 的 h-6 与 icon-xs 的 size-6 刻意不跟着降，钉死在 24px：WCAG 2.2 SC 2.5.8
   Target Size (Minimum) 的下限正是 24×24，而本仓库有 13 处控件恰好压在这条线上，
   且全部没有 after:-inset-* 扩靶（本目录唯一做对扩靶的样板是 checkbox.tsx:11，
   size-4 靠 after:-inset-x-3 after:-inset-y-2 撑到 40×32）。这一档再降就是
   20×20，当场违规；要动它得先逐处补扩靶，那是另一轮工作。 */

import { cn } from "@automationstack/ui/lib/utils";
import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";

/* 未随上游回归的一处：base class 里的 aria-disabled 视觉。
   上游 button 只给原生 :disabled 做样式，本仓库有三个按钮用 aria-disabled 表达禁用
   —— case-pagination.tsx 的上一页/下一页、case-list-view.tsx 的「新建用例」。
   它们刻意不用原生 disabled：原生禁用会把按钮移出 tab 序，键盘与读屏用户既够不到
   按钮，也听不到「为什么不能用」。若照抄上游，这三个按钮会「读屏说禁用、肉眼看可用」，
   状态只对 AT 可感知，视觉上完全没有提示。
   因此保留 opacity-50 + cursor-not-allowed，但刻意不加 pointer-events-none
   ——那会连焦点和悬停提示一起吃掉，等于退回原生 disabled 的可达性问题。 */
const buttonVariants = cva(
	"group/button inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap rounded-md border border-transparent bg-clip-padding font-medium text-sm outline-none transition-all focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-disabled:cursor-not-allowed aria-disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
	{
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
				"icon-sm":
					"size-7 in-data-[slot=button-group]:rounded-md rounded-[min(var(--radius-md),10px)]",
				"icon-xs":
					"size-6 in-data-[slot=button-group]:rounded-md rounded-[min(var(--radius-md),8px)] [&_svg:not([class*='size-'])]:size-3",
				lg: "h-9 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
				sm: "h-7 gap-1 in-data-[slot=button-group]:rounded-md rounded-[min(var(--radius-md),10px)] px-2.5 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5",
				xs: "h-6 gap-1 in-data-[slot=button-group]:rounded-md rounded-[min(var(--radius-md),8px)] px-2 text-xs has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
			},
			variant: {
				default: "bg-primary text-primary-foreground hover:bg-primary/80",
				// 未随上游回归的第二处：这里剥掉了上游的三条 focus-visible 覆盖
				// （focus-visible:border-destructive/40 / ring-destructive/20 /
				// dark:focus-visible:ring-destructive/40），让焦点指示回落到 base class 的
				// border-ring + ring-3 ring-ring/50。
				// 依据 WCAG 2.2 SC 1.4.11 Non-text Contrast（焦点指示需对相邻色 ≥ 3:1），
				// 用本仓库 theme.css 的令牌实测（本次重算，非沿用旧注释）：
				// 上游 border-destructive/40 对底面 2.15:1（亮 background）/ 2.17:1（亮 popover）
				// / 2.82:1（暗 background）/ 2.85:1（暗 popover），对按钮自身 /10 填充更低到
				// 1.80~2.36:1 —— 四种组合全部低于 3:1。暗色下 ring 用的也是 /40，与边框同色
				// （互比 1.00:1），整个指示塌成一条 2.82:1 的窄带。
				// 回落后：border-ring 对底面 16.89~17.74:1、对 /10 与 /20 淡红填充
				// 10.06~14.87:1，ring/50 光晕对底面 3.47:1（亮）/ 4.87:1（暗），全部达标。
				destructive:
					"bg-destructive/10 text-destructive hover:bg-destructive/20 dark:bg-destructive/20 dark:hover:bg-destructive/30",
				ghost:
					"hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:hover:bg-muted/50",
				link: "text-primary underline-offset-4 hover:underline",
				outline:
					"border-border bg-background shadow-xs hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50",
				secondary:
					"bg-secondary text-secondary-foreground hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)] aria-expanded:bg-secondary aria-expanded:text-secondary-foreground",
			},
		},
	}
);

function Button({
	className,
	variant = "default",
	size = "default",
	...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
	return (
		<ButtonPrimitive
			className={cn(buttonVariants({ className, size, variant }))}
			data-slot="button"
			{...props}
		/>
	);
}

export { Button, buttonVariants };

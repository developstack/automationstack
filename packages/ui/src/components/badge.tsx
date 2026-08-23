import { cn } from "@automationstack/ui/lib/utils";
import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { cva, type VariantProps } from "class-variance-authority";

const badgeVariants = cva(
	"group/badge inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden whitespace-nowrap rounded-4xl border border-transparent px-2 py-0.5 font-medium text-xs transition-all focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none [&>svg]:size-3!",
	{
		defaultVariants: {
			variant: "default",
		},
		variants: {
			variant: {
				default: "bg-primary text-primary-foreground [a]:hover:bg-primary/80",
				destructive:
					"bg-destructive/10 text-destructive focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:focus-visible:ring-destructive/40 [a]:hover:bg-destructive/20",
				/*
				 * 刻意偏离上游：上游没有这一支。本仓库的用例优先级是一条「填充强度色阶」
				 * （P0 实心危险色 → P1 淡危险色 → P2 灰填充 → P3 无填充），P0 必须是实心
				 * destructive，理由与实测值见 apps/web/src/components/cases/case-meta.ts
				 * 的 PRIORITY_BADGE_VARIANTS 注释。上游的 destructive 是淡填充，暗色下
				 * --primary 是 near-white 实心，直接回归会让 P1 压过 P0；且
				 * case-meta.ts 的 BadgeVariant 联合类型有四个 <Badge variant> 调用点
				 * （case-table / case-detail-view / version-snapshot-view /
				 * ai-proposal-item），删掉这一支会直接编译不过。
				 */
				"destructive-solid":
					"bg-destructive text-destructive-foreground focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 [a]:hover:bg-destructive/90",
				ghost:
					"hover:bg-muted hover:text-muted-foreground dark:hover:bg-muted/50",
				link: "text-primary underline-offset-4 hover:underline",
				outline:
					"border-border text-foreground [a]:hover:bg-muted [a]:hover:text-muted-foreground",
				secondary:
					"bg-secondary text-secondary-foreground [a]:hover:bg-secondary/80",
			},
		},
	}
);

function Badge({
	className,
	variant = "default",
	render,
	...props
}: useRender.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
	return useRender({
		defaultTagName: "span",
		props: mergeProps<"span">(
			{
				className: cn(badgeVariants({ variant }), className),
			},
			props
		),
		render,
		state: {
			slot: "badge",
			variant,
		},
	});
}

export { Badge, badgeVariants };

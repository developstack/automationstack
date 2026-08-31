import { Skeleton } from "@automationstack/ui/components/skeleton";

/**
 * 一张项目卡的骨架。
 *
 * 原先这里是一整块 `h-28 w-full rounded-xl` 的实心灰砖——真卡片里的墨其实只有
 * 三条短文字（项目名、一到两行描述、底部一行更新时间 + 一颗菜单按钮），
 * 灰砖却把 112px × 整卡宽全涂满，看着比真内容还重。现在改成卡的**轮廓 + 三条**：
 * 边框与圆角照抄 <Card>（`rounded-xl bg-card ring-1 ring-foreground/10`），
 * 里面按真身的顺序摆三条灰条。
 *
 * ⚠️ 高度一格不动，仍是 h-28（112px），逐条对得上：
 *   p-6 上下各 24px               → 剩 64px
 *   项目名 h-5 + gap-1 + 描述 h-4 → 40px
 *   底部一行 h-6（icon-xs 按钮的 24px，mt-auto 顶到底）→ 24px
 * 40 + 24 = 64，正好填满，外框尺寸与合并前逐像素相同。
 * 边框不额外占高：preflight 下 box-sizing 是 border-box，ring 更是画在盒外的
 * 阴影，两者都不会把 h-28 顶大。
 */
export function ProjectCardSkeleton() {
	return (
		<div className="flex h-28 w-full flex-col rounded-xl bg-card p-6 ring-1 ring-foreground/10">
			{/* 项目名 + 描述：真身里这两条之间就是 CardHeader 的 gap-1 */}
			<Skeleton className="h-5 w-1/2" />
			<Skeleton className="mt-1 h-4 w-3/4" />
			{/* 底部一行：左边「更新于 …」，右边那颗 icon-xs 菜单按钮 */}
			<div className="mt-auto flex h-6 items-center justify-between gap-2">
				<Skeleton className="h-4 w-28" />
				<Skeleton className="size-6 rounded-md" />
			</div>
		</div>
	);
}

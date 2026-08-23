import { Skeleton } from "@automationstack/ui/components/skeleton";

/**
 * Loading placeholder for the canvas. It lives in its own module so the route
 * can render it without statically importing the mind-elixir chunk.
 */
export function MindmapSkeleton() {
	/*
	 * 结构必须与 MindmapView 就绪后的外壳一致：`flex h-full flex-col` 里
	 * 一块 `min-h-0 flex-1` 的满幅画布。此前骨架自带 p-6 + gap-3 + 一条 h-8 标题条，
	 * 真实画布是整块铺满、不带内边距的，数据到达的瞬间画布会往四周弹开 24px，
	 * 顶部还凭空少掉一条 44px 的占位。
	 */
	return (
		<div className="flex h-full flex-col">
			<div className="min-h-0 flex-1">
				{/* rounded-none：它替代的是整块满幅画布，圆角会把四角削出缺口 */}
				<Skeleton className="size-full rounded-none" />
			</div>
		</div>
	);
}

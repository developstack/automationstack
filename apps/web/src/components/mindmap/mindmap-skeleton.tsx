import { Loader2Icon } from "lucide-react";

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
	 *
	 * 里面**不再是一块满幅灰板**（`size-full rounded-none` 的 Skeleton）。骨架的
	 * 全部意义是「先把内容的形状占住」，而脑图的形状根本无从预告：节点是从中心
	 * 往两侧长的一棵树，条数、层级、横向铺开多宽都由数据决定，画成一整屏灰色
	 * 既没占对任何位置，还把整个可视区涂满并跟着脉动——比空白更吵。
	 * 所以这一处换成「转圈 + 一句话」：它明说「在等」，不假装「长这样」。
	 *
	 * 外壳两层的类名一个字都没改，容器尺寸因此与合并前完全相同；
	 * 画布区域本来就是满幅，中间这块转圈是绝对居中，不产生任何位移。
	 *
	 * 用 <output> 而不是 aria-hidden 的 div：这一屏在加载期间没有别的播报区，
	 * 读屏用户此刻需要知道「在加载脑图」，否则整块就是一片沉默。
	 * Loader2Icon 的 animate-spin 刻意不加 motion-safe：全局那条
	 * prefers-reduced-motion 规则专门放过了 animate-spin（转圈是「还在动」的
	 * 唯一线索，停下来会被读成卡死），与 loader.tsx 的先例一致。
	 */
	return (
		<div className="flex h-full flex-col">
			<div className="min-h-0 flex-1">
				<output
					aria-busy="true"
					className="flex size-full flex-col items-center justify-center gap-2 text-muted-foreground"
				>
					<Loader2Icon aria-hidden="true" className="animate-spin" />
					<span className="text-sm">正在加载脑图…</span>
				</output>
			</div>
		</div>
	);
}

/**
 * 在线状态那一格：一枚点 + 「在线 / 离线」+ 上次心跳距今多久。
 *
 * 三样都要，缺一样都不够用：
 * ① 点是用来**扫**的——这一页的第一个问题永远是「几台还活着」，一列绿点数得过来；
 * ② 字是给读屏和色觉障碍的——点是 `aria-hidden`，只靠颜色分状态不成立
 *    （同 cases/case-meta.ts 的状态点约定，绿色也照那边取 `--success` 而不是
 *    借用 `--primary`：主操作色说的是「这里能点」）；
 * ③ 「12 秒前 / 3 天前」是**离线那一行的全部信息量**——刚掉的和躺了一周的，
 *    要做的事完全不同（等一等 vs 去那台机器上看看），而「离线」两个字对这两种
 *    情况说的是同一句话。在线行也留着它：心跳停在 80 秒前而仍显示在线，
 *    正是「它快掉了」的唯一预告。
 */
import { cn } from "@automationstack/ui/lib/utils";

import {
	formatLastSeenAt,
	nodeOnlineLabel,
} from "@/components/farm-nodes/farm-node-meta";

interface FarmNodeOnlineCellProps {
	lastSeenAt: Date | string | null;
	/**
	 * 算相对时间用的「现在」。**必须由调用方传** React Query 的 `dataUpdatedAt`，
	 * 不能在这里读时钟：这一页是 SSR 的，渲染里读 `Date.now()` 会让服务端与
	 * 浏览器跨过一次秒边界时给出不同的 HTML（hydration mismatch）。完整推导见
	 * farm/use-live-now.ts 顶部那一段。
	 */
	now: number;
	online: boolean;
}

export function FarmNodeOnlineCell({
	lastSeenAt,
	now,
	online,
}: FarmNodeOnlineCellProps) {
	return (
		<div className="flex items-center gap-2">
			<span
				aria-hidden="true"
				className={cn(
					"size-1.5 shrink-0 rounded-full",
					online ? "bg-success" : "bg-muted-foreground/50"
				)}
			/>
			<span>{nodeOnlineLabel(online)}</span>
			{/* 相对时间退到次要层级：它是状态的注脚，不该和状态本身抢同一份注意力 */}
			<span className="text-muted-foreground text-xs">
				{formatLastSeenAt(lastSeenAt, now)}
			</span>
		</div>
	);
}

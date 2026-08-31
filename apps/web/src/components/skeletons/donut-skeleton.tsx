/**
 * 环形图骨架。概览页两张卡与报告页一张卡共用。
 *
 * 原来这里是一整块 `mx-auto size-40 rounded-full` 的实心饼。真身是**环**：
 * OverviewDonut 的绘图半径是 innerRadius 52 / outerRadius 76（见
 * overview-donut-chart.tsx），环心是空的，中间摆着一个 text-3xl 的读数和一行
 * text-xs 的注脚。实心饼因此比它要替代的东西重得多——160px 见方的一整块实色，
 * 正是「很挤很傻」里最大的那一块。
 *
 * 几何逐项对齐真身，不靠目测：
 * - 外圈 inset-1（4px）→ 直径 152px = outerRadius 76 的两倍；
 * - 环心 inset-7（28px）→ 直径 104px = innerRadius 52 的两倍。
 * 只留这一圈之后，圆的墨量从 π·80² 降到 π·(76²−52²)，正好是 −52%。
 *
 * 环心用 bg-card 挖空而不是画一圈 border：Tailwind 的标准边框档最粗只有
 * border-8（8px），描不出 24px 的环宽，而本仓库禁任意值。bg-card 是这几张卡
 * 自己的底色（card.tsx），挖出来的洞与卡面同色，不引入任何新的颜色。
 * 洞是外圈的**兄弟节点**而不是子节点：脉动的 opacity 只作用在外圈那棵子树上，
 * 洞与洞里的读数条不跟着一起淡，位置又排在后面，稳稳盖在外圈之上。
 *
 * 高度不受影响：外层钉死 size-40，与合并前那块实心饼同尺寸，读数条摆在环心里
 * 居中，撑不动任何东西。
 */
import { Skeleton } from "@automationstack/ui/components/skeleton";

export function DonutSkeleton() {
	return (
		<div className="relative mx-auto size-40">
			<Skeleton className="absolute inset-1 rounded-full" />
			<div className="absolute inset-7 flex flex-col items-center justify-center gap-0.5 rounded-full bg-card">
				{/* 大号读数 text-3xl = 36px，注脚 text-xs = 16px，与环心那两行同档 */}
				<Skeleton className="h-9 w-12" />
				<Skeleton className="h-4 w-10" />
			</div>
		</div>
	);
}

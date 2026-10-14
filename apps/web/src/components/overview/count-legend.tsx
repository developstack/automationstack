import type { ReactNode } from "react";

import {
	formatCount,
	sharePercent,
} from "@/components/overview/overview-metrics";

export interface CountLegendItem {
	/** 图中这一类的颜色（CSS 颜色令牌），用在标签前的小圆点上。 */
	color: string;
	count: number;
	key: string;
	/** 统一状态标签。 */
	label: ReactNode;
}

interface CountLegendProps {
	items: readonly CountLegendItem[];
	total: number;
}

/** 圆环图的图例：每一类的状态标签、条数和百分比。图本身对屏幕阅读器隐藏，数量在这里。 */
export function CountLegend({ items, total }: CountLegendProps) {
	return (
		<dl className="flex w-full flex-col gap-1.5">
			{items.map((item) => (
				<div
					className="flex items-center justify-between gap-2 text-sm"
					key={item.key}
				>
					<dt className="flex items-center gap-2">
						<span
							aria-hidden="true"
							className="size-2.5 shrink-0 rounded-full"
							style={{ backgroundColor: item.color }}
						/>
						{item.label}
					</dt>
					<dd className="numeric">
						{formatCount(item.count)}
						<span className="ml-2 text-muted-foreground text-xs">
							{`${sharePercent(item.count, total)}%`}
						</span>
					</dd>
				</div>
			))}
		</dl>
	);
}

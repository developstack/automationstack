import { type ReactNode, Suspense } from "react";

interface ChartSuspenseProps {
	/** 图表盒子的类名。加载图表代码时显示同样大小的空盒子，布局不跳动。 */
	boxClassName: string;
	children: ReactNode;
	/** 图表的高度由数据决定时，空盒子使用同样的高度。 */
	heightPx?: number;
}

export function ChartSuspense({
	boxClassName,
	children,
	heightPx,
}: ChartSuspenseProps) {
	const style =
		heightPx === undefined ? undefined : { height: `${heightPx}px` };
	return (
		<Suspense
			fallback={
				<div aria-hidden="true" className={boxClassName} style={style} />
			}
		>
			{children}
		</Suspense>
	);
}

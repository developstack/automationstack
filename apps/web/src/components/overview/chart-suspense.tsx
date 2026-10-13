import { type ReactNode, Suspense } from "react";

interface ChartSuspenseProps {
	/** 图表盒子的类名。加载图表代码时显示同样大小的空盒子，布局不跳动。 */
	boxClassName: string;
	children: ReactNode;
}

export function ChartSuspense({ boxClassName, children }: ChartSuspenseProps) {
	return (
		<Suspense fallback={<div aria-hidden="true" className={boxClassName} />}>
			{children}
		</Suspense>
	);
}

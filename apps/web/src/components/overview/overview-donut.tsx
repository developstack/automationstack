/**
 * 环形图的懒加载壳。三张卡（用例总数 / 模块覆盖 / 报告结果分布）引的都是
 * 这里，真身在 overview-donut-chart.tsx。
 *
 * 为什么要这一层：recharts（连同它内部依赖）打出来是 364KB / gzip 103KB 的一整个
 * chunk。拆之前它是**入口 chunk 的静态依赖**，还挂在根路由的 preloads 里——也就是说
 * /login、/projects 这些一张图都没有的页面，照样得先把这 103KB 下下来才能起应用。
 * 原因不是哪个模块「用错了」，而是这几张图分散在概览页与报告页两条路由上，Rollup 把
 * 这个公共依赖提到了两条路由的共同祖先，也就是入口。
 *
 * lazy + import() 在这里的作用是画一条 Rollup 提不动的异步边界：recharts 从此只在
 * 真正要画图的路由上按需取。
 *
 * SSR：recharts 本身在 import 期不碰 window/navigator（与 @codemirror/view 不同，
 * 那个必须再套一层 ClientOnly），所以这里只用 Suspense、不加 ClientOnly——服务端
 * 照旧把环渲染进 HTML，首屏看到的东西和拆分前一样，变的只是客户端那份 chunk 什么
 * 时候取。Suspense 边界在服务端已经有 HTML 的情况下，React 会留着那段 HTML 直到
 * chunk 到达再补水，不会 hydration mismatch。
 *
 * 占位与真身等高（DONUT_BOX 两边共用），理由见 chart-box.ts。
 */
import { lazy, Suspense } from "react";

import { DONUT_BOX } from "@/components/overview/chart-box";
import type { OverviewDonutProps } from "@/components/overview/overview-donut-chart";

/** 纯类型再导出，编译期就被抹掉，不会给这个壳加上一条通往 recharts 的运行时边。 */
export type { DonutSlice } from "@/components/overview/overview-donut-chart";

const LazyOverviewDonutChart = lazy(async () => {
	const chartModule = await import(
		"@/components/overview/overview-donut-chart"
	);
	return { default: chartModule.OverviewDonutChart };
});

/**
 * chunk 到达前的占位：与环等大的一块空白，不画假的环、也不先把中心读数用 HTML 摆
 * 上去——真身那份读数是画在 SVG 里的，两套排版对不齐的话，chunk 到达那一帧会看到
 * 数字自己挪一下。空白只是「还没画出来」，不会给出一个待会儿要被推翻的样子。
 */
const DONUT_FALLBACK = <div aria-hidden="true" className={DONUT_BOX} />;

export function OverviewDonut(props: OverviewDonutProps) {
	return (
		<Suspense fallback={DONUT_FALLBACK}>
			<LazyOverviewDonutChart {...props} />
		</Suspense>
	);
}

import { cn } from "@automationstack/ui/lib/utils";
import { motion } from "motion/react";
import { createContext, type ReactNode, useContext, useMemo } from "react";

/**
 * 页面进场的「子元素按顺序依次出现」。
 *
 * 与 page-transition.tsx 的分工：那边判定「这一次该不该播进场」，这边只消费那个
 * 判定，自己不再做任何「算不算页面切换」的推断。判定为「不播」时，这边也一定不错开。
 *
 * 为什么单独一个文件：page-transition.tsx 已经 250+ 行，逼近仓库 300 行上限；
 * 而且依赖是单向的（page-transition 只 import 本文件的 Provider，本文件不 import
 * 它的任何东西），拆开不会绕出环。
 *
 * ## 为什么每一项要外包一层 <motion.div>
 *
 * 三条路只有这条在「只改进场机制与调用页」的前提下走得通：
 *
 * - `motion.create(Card)`：技术上成立——Card 是普通函数组件，把 props 原样摊到
 *   <div> 上，React 19 里 ref 也走 props，style 与 ref 都能到位。但要改的是**各张卡
 *   自己的文件**（六张卡各自内部渲染 <Card>），调用页够不着。
 * - 靠 variants 沿父子链自动下发：motion 只把变体下发给 **motion 组件**，而这里
 *   <main> 的子节点是各张卡组件内部渲染出来的普通 <Card> div，链在第一跳就断。
 *   `custom` 也救不了——它解决的是「同一个变体按序号取不同值」，不解决「谁算子节点」。
 * - 于是只剩「外包一层」。
 *
 * ## 外包一层为什么没有把栅格搞坏
 *
 * 包一层的经典事故是：新加的这层变成 grid item，卡片上的 `col-span-*` 落在了
 * 非 grid item 上，整条跨列失效。两点分别堵住两个坑：
 *
 * 1. 本层收 className——`col-span-*` 应当写在**本层**上。报告页本来就是这个写法
 *    （report-view.tsx 里的 `<div className={FULL_WIDTH}>`），接入时把那层 div
 *    换成本组件即可，类名的层级一点没变。概览页则根本没有 col-span。
 * 2. 本层写死 `grid`。外层栅格的 `align-items` 默认是 stretch：卡片原本自己就是
 *    grid item，会被拉到整行的高度；一旦外面包上一层普通块级盒，被拉高的是那层盒子，
 *    卡片只剩内容高度，同一行的卡底边会参差。让本层自己也是 grid，它的唯一子节点
 *    同样被 stretch，高度与不包时逐像素一致。
 */

/** 相邻两项之间的间隔。40ms 是「读得出先后」与「像卡顿」之间的那一档。 */
const STAGGER_STEP_S = 0.04;
/**
 * 最多错开几档。列表页动辄二三十行，`index * 间隔` 会线性膨胀到近一秒——
 * 那就不是顺滑，是逐条播报。封顶之后无论多少项，整体错开都不超过
 * 5 × 40ms = 200ms，仍然落在主进场那 300ms 之内。
 */
const STAGGER_MAX_STEPS = 5;
/**
 * 单项位移，与 page-transition 的 ENTER_OFFSET_PX 同为 6px。
 * 不 import 那个常量是为了不在两个文件之间绕出环。
 *
 * 注意两层位移会叠：<main> 整块上浮 6px 的同时，每一项自己再上浮 6px，
 * 第一项在 t=0 那一帧合计 12px。只有排在最前的项赶得上这个叠加——后面的项
 * 起步时 <main> 已经快落位了，所以实际观感仍是 6px 出头。
 */
const ITEM_OFFSET_PX = 6;
/**
 * 单项时长比主进场的 300ms 略短：最后一项延迟 200ms 起步，
 * 240ms 走完，整场进场收在 440ms，不至于拖出一条尾巴。
 */
const ITEM_DURATION_S = 0.24;

const ITEM_FROM = { opacity: 0, y: ITEM_OFFSET_PX };
const ITEM_TO = { opacity: 1, y: 0 };
const ITEM_TRANSITION = {
	bounce: 0,
	duration: ITEM_DURATION_S,
	type: "spring",
} as const;

export interface PageEnterState {
	/** 用户要求减弱动效。 */
	reduceMotion: boolean;
	/**
	 * 这次挂载不播进场。由 page-transition 算出（首帧 / 接在同一条 pathname 的
	 * 另一份后面），这边只读不判。
	 */
	skipEnter: boolean;
}

/**
 * 没有 Provider 时的默认值：一律不错开。
 *
 * 默认倒向「不播」而不是「播」：StaggerItem 将来完全可能被放到 PageTransition
 * 之外（弹层里、某个局部区域里），那种地方没有「页面切换」这回事，什么都不做
 * 才是对的。模块级常量，每次读都是同一个对象，不会白让下游重渲。
 */
const NO_ENTER: PageEnterState = { reduceMotion: false, skipEnter: true };

const PageEnterContext = createContext<PageEnterState>(NO_ENTER);

interface PageEnterProviderProps extends PageEnterState {
	children: ReactNode;
}

/**
 * 由 PageTransition 挂在 <main> 里侧，把它已经算好的判定发下去。
 *
 * Provider 自己不持有状态：那两个判定的正确性全靠 page-transition 里那套
 * 首帧标记 + onScreenPathname 通道，拆到这里重算一份只会变成两处真相。
 */
export function PageEnterProvider({
	children,
	reduceMotion,
	skipEnter,
}: PageEnterProviderProps) {
	const value = useMemo<PageEnterState>(
		() => ({ reduceMotion, skipEnter }),
		[reduceMotion, skipEnter]
	);
	return (
		<PageEnterContext.Provider value={value}>
			{children}
		</PageEnterContext.Provider>
	);
}

interface StaggerItemProps {
	children: ReactNode;
	/**
	 * 本层自己的类名。栅格定位类（`col-span-*` / `row-span-*`）必须写在这里，
	 * 而不是写在里面的卡上——本层才是 grid item。
	 */
	className?: string;
	/**
	 * 出场次序，从 0 起。显式传而不是由父层数出来：列表页的项本来就来自
	 * `.map((item, i) => ...)`，序号现成；而静态排布的页面有时希望出场顺序
	 * 与 DOM 顺序不同（比如让标题先于图表），那时也只有调用方知道该排第几。
	 */
	index: number;
}

/**
 * 进场时按 `index` 错开出现的一项。
 *
 * ## 「改筛选时不会错开」靠什么保证
 *
 * 完全靠 `skipEnter`，本组件不自己判断。列表页改筛选走的是「就绪 → 骨架 → 就绪」，
 * pathname 没变，page-transition 的 onScreenPathname 通道会把那两次重挂都算成
 * 「接在同一页后面」，`skipEnter` 为 true——于是这里也一次都不错开。想验证这条，
 * 看的是 page-transition.tsx 里 followsSamePath 那段，不是这里。
 *
 * ## 减弱动效
 *
 * 整体关掉，不是缩短：`initial={false}` 让每一项直接落在终态，错开与位移全都不发生，
 * 只剩 <main> 自己那一次 120ms 的透明度变化把内容托上来。逐项动效在减弱诉求下
 * 恰恰是最刺眼的那部分，把间隔调小只是把同一件事做快，不是不做。
 *
 * ## 只压 initial，不碰 animate
 *
 * 与 page-transition 同一条约束：`animate` 无论如何都是同一个终态，两种「不播」
 * 都只作用在 `initial` 上。终态若也跟着条件变，服务端（永远算作不减弱）与客户端
 * 会渲染出不同的 style，注水时报不一致。
 *
 * `transition` 里的 delay 是条件相关的，这一点安全：transition 不参与首帧样式的
 * 计算，服务端渲染的 style 里没有它。
 *
 * 另外，服务端 `skipEnter` 恒为 true（那边 hasPaintedOnce 恒 false），所以本层在
 * 服务端一定走 `initial={false}`，`reduceMotion` 在服务端取到什么值都影响不了
 * SSR 输出——与 page-transition 里 enterFrom 的处境完全一样。
 */
export function StaggerItem({ children, className, index }: StaggerItemProps) {
	const { reduceMotion, skipEnter } = useContext(PageEnterContext);
	const skipStagger = skipEnter || reduceMotion;
	const delay = Math.min(index, STAGGER_MAX_STEPS) * STAGGER_STEP_S;

	return (
		<motion.div
			animate={ITEM_TO}
			className={cn("grid", className)}
			initial={skipStagger ? false : ITEM_FROM}
			transition={{ ...ITEM_TRANSITION, delay }}
		>
			{children}
		</motion.div>
	);
}

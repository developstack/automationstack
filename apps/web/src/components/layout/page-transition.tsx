import { useParams } from "@tanstack/react-router";
import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";

/**
 * 路由级页面过渡：全站唯一使用 motion 的地方。
 *
 * 只有一个动作——**真内容挂载时的纯淡入**：不透明度 0 → 1、220ms、
 * cubic-bezier(0.2, 0, 0, 1)，不带任何位移。骨架不淡入（见 PageTransitionPhase）。
 *
 * 与既有 CSS 过渡的分工（不要两套混用）：
 * - motion 只负责「换路由时主内容区的进场」这一层。
 * - 控件的开合、按压、侧栏收展仍走 globals.css 里手写的 transition 工具类
 *   （transition-control / transition-crossfade / press-scale / transition-sidebar-*）。
 *   它们刻意用 transition 而不是 keyframes，因为 keyframes 不可打断，而模块树
 *   每一行都挂着弹层。本次不把它们迁到 motion。
 * - 主题明暗切换走的是另一条完全独立的路：View Transitions API 的圆形揭示
 *   （components/theme/theme-transition.ts + packages/ui/src/styles/view-transition.css）。
 *
 * 边界为什么落在 <main> 而不是 __root 的 <Outlet />：一级侧栏、顶栏、二级模块面板
 * 是跨路由稳定的外壳，包在 Outlet 外面它们会跟着整页一起淡入淡出，每次导航都闪一下。
 * 换掉的只有主内容，动画就只加在主内容上。
 *
 * 为什么没有退场（也就没有 AnimatePresence）：退场要求有一个跨路由存活的
 * AnimatePresence 祖先，而本仓库每个路由各自 new 一份 AppShell / ProjectShell，
 * 切路由时整棵子树连着外壳一起卸载——唯一能存活的位置就是 __root，那正是上面
 * 排除掉的边界。何况 mode="wait" 会让新页面等旧页面播完才开始，把每次点击都
 * 拖慢一个动画时长。只做进场：额外等待为 0ms，新内容第一帧就已经在画。
 *
 * ## key 读的是「已提交的 match params」，不是 location.pathname
 *
 * 这一段是本文件修过的最严重的一个 bug，展开写一次，别再改回去。
 *
 * `router.stores.location` 是**乐观值**：`loadClientRoute` 在同步段里就把它翻成目标
 * 地址（router-core `dist/esm/load-client.js:1113-1115`，batch 里的
 * `router.stores.location.set(location)`），而那一刻屏幕上渲染的还是旧页面。
 * `useRouterState` 底层是 `useSyncExternalStore`、走 sync lane，不会被
 * `startTransition` 推迟。于是 `key={location.pathname}` 在**点击那一帧**就变了：
 * 旧页面的 <main> 被整棵拆掉重建，进场动画播在旧页面上；<main> 还是滚动容器
 * （overflow-y-auto），重建后 scrollTop 归零，旧页面离开前先跳回顶部。
 *
 * 为什么不换成 `stores.resolvedLocation`（在源码里核过时序，它比 matches **更晚**）：
 * `load-client.js:988` 先 `await router.startTransition(commit, result[1])`，commit 里
 * 跑的正是 `commitMatches` → `publishMatches` → `stores.setMatches`（`:720`）；这个
 * await 要等 react-router 的 Transitioner 把 acknowledgement resolve 掉
 * （react-router `dist/esm/Transitioner.js:16-28`）——也就是等 React 真的渲染完——
 * 才继续，而 `router.stores.resolvedLocation.set(toLocation)` 排在它后面
 * （`load-client.js:995-996`）。拿它当 key，新内容会先以**旧** key 挂载一次、下一帧
 * 再因为 key 变了整棵重挂，等于把「早一帧」换成「多一次重挂」。
 *
 * 所以取的是**已提交 match 的 params**：`useParams` 走 `useMatch` →
 * `router.stores.getMatchStore(routeId)`（react-router `dist/esm/useMatch.js:22-39`），
 * 而每条 route 的 match store 只由 `setMatches` 写（router-core
 * `dist/esm/stores.js:55-66`）。`setMatches` 的调用点只有两处，都在渲染提交里：
 * `offerPending` 换上骨架（`load-client.js:701`）与 `commitMatches` 换上真内容
 * （`load-client.js:720`）。乐观的那次 `stores.location.set` 一次都不碰它。
 * 「params 变了」与「屏幕上换了东西」因此是同一帧。
 *
 * 为什么是 params 而不是 `match.id`：match.id 是 `route.id + 插值路径 + loaderDeps`
 * 拼出来的（router-core `dist/esm/router.js:712`），列表页改个筛选就变——那是页内
 * 操作，不该重挂。
 *
 * 为什么只靠 params 就够：跨路由导航换的是**不同的组件类型**，React 本来就会重挂，
 * 用不着 key 帮忙。真正需要 key 的只有「同一个路由组件、参数不同」这一类：
 * /projects/a → /projects/b、/test-runs/r1 → /test-runs/r2。
 *
 * ## 曾经存在过的「逐项错开」（page-stagger）
 *
 * 这里一度还有一层 PageEnterProvider，把判定发给页面里的 StaggerItem，各张卡按
 * index 依次淡入（40ms 一档，封顶 5 档）。**已整体删除**：叠上主进场后整场要拖到
 * 440ms，用户的评价是「太拖沓」。所以 overview-view.tsx / report-view.tsx /
 * report-skeleton.tsx 里的卡片平铺在栅格里、彼此没有出场次序，**那是刻意的**，
 * 别再把它们一张张错开。
 */

/**
 * 本次挂载在「骨架 ↔ 就绪」这条链上的位置。判定规则就一句话：
 * **骨架不淡入，只有真内容淡入。**
 *
 * - "pending": 路由 pendingComponent 里的那一份。骨架是「在等」的表示，
 *   本来就不该有出场感；它淡入反而是在给一块占位符做仪式。
 * - "ready": 同一条路由的就绪态。淡入。
 *
 * 不传等同于 "ready"：/login、脑图页、404、错误页压根没有骨架这一档。
 *
 * 这条规则取代了原先那套跨子树的模块级状态通道（page-transition-phase.ts，已删除）。
 * 那套东西存在的唯一理由是「乐观 pathname 让『这一页是不是已经在屏幕上』失了准」，
 * key 改读已提交 params 之后病根没了，它的存在理由也就没了。
 */
export type PageTransitionPhase = "pending" | "ready";

/**
 * 进场时长 220ms。0 → 1 的整段淡入，配下面那条起步斜率为 0 的曲线，前几十毫秒几乎
 * 不动，视觉上的「变化期」比数值短，220ms 读起来接近一次 150ms 的淡入而不挡手。
 */
const ENTER_DURATION_S = 0.22;

/**
 * 减弱动效档的时长 120ms。**不是取消动画**，见下面 ENTER_TRANSITION_REDUCED。
 */
const ENTER_REDUCED_DURATION_S = 0.12;

/*
 * Material 3 的 standard easing，也正是 globals.css 里 transition-crossfade 用的那条
 * （cubic-bezier(0.2, 0, 0, 1)）：起步斜率为 0，不会一上来就闪；尾段拉长收住。
 * 页面级与控件级的交叉淡入从此是同一条曲线，两档只差时长。
 */
const ENTER_EASE_X1 = 0.2;
const ENTER_EASE_Y1 = 0;
const ENTER_EASE_X2 = 0;
const ENTER_EASE_Y2 = 1;
const ENTER_EASE = [
	ENTER_EASE_X1,
	ENTER_EASE_Y1,
	ENTER_EASE_X2,
	ENTER_EASE_Y2,
] as const;

/*
 * **只动 opacity**。原先还带 4px 的 y 位移，已去掉：外壳（侧栏、顶栏、模块面板）
 * 跨路由是稳定的，它们瞬间就位，主内容再上下挪一点就是和自己的边框错开，
 * 越大的屏幕越明显。纯不透明度也是合成器能独立处理的属性，不引起布局与重绘。
 * will-change 不手写——motion 在动画期间自挂自摘，写死一份只会长期把 <main>
 * 提成独立合成层。
 */
const ENTER_FROM = { opacity: 0 };
const ENTER_TO = { opacity: 1 };
const ENTER_TRANSITION = {
	duration: ENTER_DURATION_S,
	ease: ENTER_EASE,
} as const;

/**
 * 减弱动效档：**保留淡入，缩到 120ms**，不是直接没有动画。
 *
 * 这里以前的结论是「整页尺度的不透明度补间不是图标那种局部交叉淡入，用户要求减弱
 * 就不该替他留着」，按官方口径站不住，三条依据：
 *
 * 1. Apple HIG 的原则是「**替换**，不是删除」——动效在传达信息时应提供非动效替代
 *    而不是移除，它点名的替代形式就包括 dissolve（溶解）。iOS 有独立的「偏好交叉
 *    淡入过渡」开关，UIKit 会把标准导航转场自动换成 dissolve。
 * 2. MDN 关于 prefers-reduced-motion 的官方示例，做的正是把 transform: scale()
 *    换成透明度溶解。纯透明度**不构成前庭触发源**，会触发的是缩放与大幅平移——
 *    y 位移已经在上面去掉了，剩下的这一档本就在安全区里。
 * 3. 本仓自己在 globals.css 的 transition-crossfade 上就保留了 120ms
 *    （--motion-reduced-duration）。页面级和控件级两处结论原本互相打架，现在统一。
 */
const ENTER_TRANSITION_REDUCED = {
	duration: ENTER_REDUCED_DURATION_S,
	ease: ENTER_EASE,
} as const;

/*
 * 「本次会话是否已经画过第一帧」。只在浏览器里置位：服务端的模块作用域跨请求共享，
 * 在那边写会让第二个请求起就以为已经挂载过。effect 不在服务端跑，所以它在
 * 服务端恒为 false，SSR 与注水首帧算出的样式因此一致，不会触发 hydration 警告。
 */
let hasPaintedOnce = false;

/**
 * 把已提交 match 的 params 压成一个 key。
 *
 * 不同路由可能压出同一个字符串（两个无参路由都是 "{}"），这不要紧：它们是不同的
 * 组件类型，React 已经会重挂，key 在那儿本来就不起作用。key 唯一要分开的是
 * 「同一个路由组件、参数不同」。
 */
const selectParamsKey = (params: object) => JSON.stringify(params);

interface PageTransitionProps {
	children: ReactNode;
	/** 各路由自己的 main 类名；本组件不加任何布局样式。 */
	className?: string;
	/** 见 PageTransitionPhase。 */
	phase?: PageTransitionPhase;
}

/**
 * 各路由主内容区的 <main>：地标、跳转落点与进场动画合并在这里。
 *
 * 直接渲染成 motion.main 而不是在外面再包一层：main 处在
 * 「满高外壳 → min-h-0 → overflow-y-auto」这条高度链上，插入任何中间层都会断链。
 */
export function PageTransition({
	children,
	className,
	phase,
}: PageTransitionProps) {
	/*
	 * strict: false —— 取「最近的那个已渲染 match」，本组件在每个路由里的位置不同，
	 * 写不出统一的 from。shouldThrow: false —— 取不到 match 时返回 undefined 而不是
	 * 抛错；这一层抛错会把整页连着外壳一起炸成白屏，为一个 key 不值得。
	 * key={undefined} 退化成按位置匹配，正是「不需要 key」时本来就对的行为。
	 */
	const paramsKey = useParams({
		select: selectParamsKey,
		shouldThrow: false,
		strict: false,
	});

	return (
		<PageTransitionFrame className={className} key={paramsKey} phase={phase}>
			{children}
		</PageTransitionFrame>
	);
}

/**
 * 真正拿着动画状态的一层。必须与上面分开：首帧标记存在 state 里，
 * 只有随 key 一起重新挂载才会重新计算。
 */
function PageTransitionFrame({
	children,
	className,
	phase,
}: PageTransitionProps) {
	const shouldReduceMotion = useReducedMotion();
	/*
	 * 首帧（含 SSR 注水后的第一帧）不播进场：initial={false} 让 motion 直接落在
	 * 终态。否则每次刷新页面都要抖一下，而刷新时并没有发生「页面之间的切换」。
	 */
	const [isFirstPaint] = useState(() => !hasPaintedOnce);

	useEffect(() => {
		hasPaintedOnce = true;
	}, []);

	/*
	 * 两条互相独立的「这次不播」：
	 * - 首帧：压根没发生页面切换。
	 * - 骨架：它是「在等」的表示，不该有出场感。
	 *
	 * 减弱动效**不在这里**——它换的是时长（120ms），不是有无。
	 * 两者都只压 initial，绝不去碰 animate，原因见下面那段。
	 */
	const skipEnter = isFirstPaint || phase === "pending";

	return (
		/*
		 * animate 无论如何都是同一个终态：不播时改的只有 initial。两者若连终态也不同，
		 * 服务端（永远算作不减弱）与客户端就会渲染出不同的 style 属性，注水时报不一致。
		 *
		 * transition 只是时长与曲线，不落进首帧的 style，所以 useReducedMotion() 在
		 * 服务端与首帧返回 null（与 true 显式比较后取常规档）不会造成注水差异；
		 * 何况那两种时刻 isFirstPaint 恒为真，initial 已经是 false。
		 *
		 * tabIndex=-1：「跳到主要内容」把焦点真正落进 main，否则 Tab 会从页首继续。
		 */
		<motion.main
			animate={ENTER_TO}
			className={className}
			id="main"
			initial={skipEnter ? false : ENTER_FROM}
			tabIndex={-1}
			transition={
				shouldReduceMotion === true
					? ENTER_TRANSITION_REDUCED
					: ENTER_TRANSITION
			}
		>
			{children}
		</motion.main>
	);
}

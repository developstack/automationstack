import { useRouterState } from "@tanstack/react-router";
import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";

import type { PageTransitionPhase } from "@/components/layout/page-transition-phase";
import {
	isPathnameOnScreen,
	useOnScreenRegistration,
} from "@/components/layout/page-transition-phase";

/*
 * 原样再导出：调用方一直是从本文件 import 这个类型的，拆文件不该让它们改 import。
 * 写成 `export ... from` 而不是把上面那个 import 进来的名字直接 export，是 Biome 的
 * noExportedImports 要求；上面那条 import 仍要留着，本文件的 props 类型自己也要用它。
 */
export type { PageTransitionPhase } from "@/components/layout/page-transition-phase";

/**
 * 路由级页面过渡：全站唯一使用 motion 的地方。
 *
 * 与既有 CSS 过渡的分工（不要两套混用）：
 * - motion 只负责「换路由时主内容区的进场」这一层。
 * - 控件的开合、按压、侧栏收展仍走 globals.css 里手写的 transition 工具类
 *   （transition-control / popup-transition / press-scale / transition-sidebar-*）。
 *   它们刻意用 transition 而不是 keyframes，因为 keyframes 不可打断，而模块树
 *   每一行都挂着弹层。本次不把它们迁到 motion。
 * - 主题明暗切换走的是另一条完全独立的路：View Transitions API 的圆形揭示
 *   （components/theme/theme-transition.ts + packages/ui/src/styles/view-transition.css）。
 *   那边动的是根元素的整页快照，与本文件的 <main> 进场互不相干，也不会同时发生。
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
 * ## 为什么不改用 TanStack Router 的 viewTransition 导航选项
 *
 * 路由支持 `navigate({ viewTransition: true })`，由它把 DOM 更新包进
 * document.startViewTransition。评估结论是**不换**，三条理由：
 *
 * 1. 与「不推迟内容可见」冲突：转场要先冻结旧画面截快照，这段时间渲染停住；
 *    本文件这套进场则是新内容第一帧就在画，只是不透明度还差一点。
 * 2. 截到的会是骨架不是内容：超过 defaultPendingMs（router.tsx，200ms）的导航先
 *    换上 pendingComponent，回调里提交的正是那份骨架；真数据到达那一跳反倒是不在
 *    任何转场里的硬切。
 * 3. 边界收不回 <main>：根级转场把侧栏顶栏一起截进快照，正是上面刻意排除的
 *    「每次导航整页闪一下」；即便单起 view-transition-name 收窄动画，快照仍是整页
 *    冻结，侧栏当前项高亮会在转场期间僵在旧值上。
 *
 * 主题切换结论正好相反（所以那边用了它）：那是一次没有 DOM 结构变化的整页重绘，
 * 旧快照恰恰就是要被揭开的那一层，用户不是在等内容，是在看颜色翻面。
 *
 * ## 曾经存在过的「逐项错开」（page-stagger）
 *
 * 这里一度还有一层 PageEnterProvider，把判定发给页面里的 StaggerItem，各张卡按
 * index 依次淡入（40ms 一档，封顶 5 档）。**已整体删除**：叠上主进场后整场要拖到
 * 440ms，用户的评价是「太拖沓」。所以 overview-view.tsx / report-view.tsx /
 * report-skeleton.tsx 里的卡片平铺在栅格里、彼此没有出场次序，**那是刻意的**，
 * 别再把它们一张张错开。
 */

/** 触发重播的粒度：按 pathname 换 key。 */
const selectPathname = (state: { location: { pathname: string } }) =>
	state.location.pathname;

/**
 * 进场位移。6px → 4px：时长砍掉四成之后，原来的位移在更短的时间里走完，
 * 速度反而更快、更像被甩进来。
 */
const ENTER_OFFSET_PX = 4;

/**
 * 进场的起始不透明度。**刻意不是 0。**
 *
 * 从 0 淡入等于拿动画时长把内容挡在门外，转场就从修饰变成了门槛。0.6 起步则
 * 第一帧就已经读得清，余下那点变化只负责告诉眼睛「这块换了」。
 */
const ENTER_OPACITY_FROM = 0.6;

/**
 * 进场时长。300ms → 180ms。原来的 300ms 叠上已删除的逐项错开（最后一项 200ms
 * 起步、240ms 走完）实际要 440ms 才收尾。导航是高频操作，180ms 已经够读出
 * 「换了一页」，再长就开始挡手——连点两下时上一次还没播完。
 */
const ENTER_DURATION_S = 0.18;

/**
 * 缓动：easeOutExpo，前三成时间走掉九成距离，尾巴收得很轻。原来是 spring(bounce=0)，
 * 改成显式曲线是为了与 theme-transition.ts 的圆形揭示取同一条线；控件级开合仍是
 * globals.css 那边的 ease-out 150ms，两档分开。
 */
const ENTER_EASE_X1 = 0.16;
const ENTER_EASE_Y1 = 1;
const ENTER_EASE_X2 = 0.3;
const ENTER_EASE_Y2 = 1;

/*
 * 只动 opacity 与 y（motion 编译成 transform: translateY），都是合成器能独立处理
 * 的属性。刻意不碰 height / width / top，也没有 transition: all。will-change 也
 * 不手写——motion 在动画期间自挂自摘，写死一份只会长期把 <main> 提成独立合成层。
 */
const ENTER_FROM = { opacity: ENTER_OPACITY_FROM, y: ENTER_OFFSET_PX };
const ENTER_TO = { opacity: 1, y: 0 };
const ENTER_TRANSITION = {
	duration: ENTER_DURATION_S,
	ease: [ENTER_EASE_X1, ENTER_EASE_Y1, ENTER_EASE_X2, ENTER_EASE_Y2],
} as const;

/*
 * 「本次会话是否已经画过第一帧」。只在浏览器里置位：服务端的模块作用域跨请求共享，
 * 在那边写会让第二个请求起就以为已经挂载过。effect 不在服务端跑，所以它在
 * 服务端恒为 false，SSR 与注水首帧算出的样式因此一致，不会触发 hydration 警告。
 */
let hasPaintedOnce = false;

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
	const pathname = useRouterState({ select: selectPathname });

	/*
	 * key 换 pathname 而不是整个 href：切项目（/projects/a → /projects/b）走的是同
	 * 一个路由组件，不换 key 就不会重新挂载、也就不会重播。
	 *
	 * 反过来，pathname 不变并不足以拦住重播：列表页改筛选只动 search，但 loader 一旦
	 * 超过 200ms，路由就把 pendingComponent 换上来，组件类型变了，key 保不住身份，那一份
	 * 骨架照样是全新挂载。页内操作之所以一次都不淡入，靠的是 page-transition-phase.ts
	 * 那条通道而不是这个 key；pathname 在这里同时兼任「算不算同一页」的判定粒度。
	 */
	return (
		<PageTransitionFrame
			className={className}
			key={pathname}
			pathname={pathname}
			phase={phase}
		>
			{children}
		</PageTransitionFrame>
	);
}

interface PageTransitionFrameProps extends PageTransitionProps {
	/*
	 * 由上面传下来而不是在这里再取一次：骨架与就绪两端必须对同一个值做判断，
	 * 各自订阅一次 router state 只是把「同一个来源」写成两处。
	 */
	pathname: string;
}

/**
 * 真正拿着动画状态的一层。必须与上面分开：首帧标记存在 state 里，
 * 只有随 key 一起重新挂载才会重新计算。
 */
function PageTransitionFrame({
	children,
	className,
	pathname,
	phase,
}: PageTransitionFrameProps) {
	const shouldReduceMotion = useReducedMotion();
	/*
	 * 首帧（含 SSR 注水后的第一帧）不播进场：initial={false} 让 motion 直接落在
	 * 终态。否则每次刷新页面都要抖一下，而刷新时并没有发生「页面之间的切换」。
	 */
	const [isFirstPaint] = useState(() => !hasPaintedOnce);
	/*
	 * 「这次挂载之前，同一条 pathname 的另一份是不是就摆在屏幕上」。是就说明这只是同
	 * 一页内部的一次重挂（骨架与就绪互换），不是页面之间的切换。没标 phase 的页面
	 * （/login、脑图页、404）直接算作不在链上。判定细节见 page-transition-phase.ts。
	 */
	const [followsSamePath] = useState(
		() => phase !== undefined && isPathnameOnScreen(pathname)
	);

	useEffect(() => {
		hasPaintedOnce = true;
	}, []);

	useOnScreenRegistration(pathname, phase);

	/*
	 * 三条互相独立的「这次不播」，理由不同但结果一样：
	 *
	 * - 首帧：压根没发生页面切换。
	 * - 接同一页：这次重挂只是骨架与真内容互换——跨页那一跳的进场已经由先到的那份
	 *   播过，而筛选引发的就绪 → 骨架 → 就绪从头到尾都不该播。
	 * - 减弱动效：**直接没有动效，不是动得慢一点**。之前这里留了一档 120ms 的透明度
	 *   变化，现已整条去掉——整页尺度的不透明度补间不是图标那种局部交叉淡入，用户
	 *   要求减弱就不该替他留着。控件级交叉淡入仍走 globals.css 的
	 *   --motion-reduced-duration 口子，不受本改动影响。
	 *
	 * 三者都只压 initial，绝不去碰 animate——原因见下面那段。
	 */
	const skipEnter =
		isFirstPaint || followsSamePath || shouldReduceMotion === true;

	return (
		/*
		 * animate 无论如何都是同一个终态：不播时改的只有 initial。两者若连终态也不同，
		 * 服务端（永远算作不减弱）与客户端就会渲染出不同的 style 属性，注水时报不一致。
		 *
		 * useReducedMotion() 在服务端与首帧可能是 null，与 true 显式比较：那两种时刻
		 * isFirstPaint 恒为真，skipEnter 已经是 true，这里取到 null 影响不了任何输出。
		 *
		 * tabIndex=-1：「跳到主要内容」把焦点真正落进 main，否则 Tab 会从页首继续。
		 */
		<motion.main
			animate={ENTER_TO}
			className={className}
			id="main"
			initial={skipEnter ? false : ENTER_FROM}
			tabIndex={-1}
			transition={ENTER_TRANSITION}
		>
			{children}
		</motion.main>
	);
}

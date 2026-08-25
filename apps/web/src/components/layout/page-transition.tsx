import { useRouterState } from "@tanstack/react-router";
import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";

import { PageEnterProvider } from "@/components/layout/page-stagger";

/**
 * 路由级页面过渡：全站唯一使用 motion 的地方。
 *
 * 与既有 CSS 过渡的分工（不要两套混用）：
 * - motion 只负责「换路由时主内容区的进场」这一层。
 * - 控件的开合、按压、侧栏收展仍走 globals.css 里手写的 transition 工具类
 *   （transition-control / popup-transition / press-scale / transition-sidebar-*）。
 *   它们刻意用 transition 而不是 keyframes，因为 keyframes 不可打断，而模块树
 *   每一行都挂着弹层。本次不把它们迁到 motion。
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
 */

/** 触发重播的粒度：按 pathname 换 key。 */
const selectPathname = (state: { location: { pathname: string } }) =>
	state.location.pathname;

/** 进场位移：几 px 级的「浮上来」，大位移会让人觉得内容在被甩进来。 */
const ENTER_OFFSET_PX = 6;
/** 进场时长；spring 且 bounce=0，收尾不回弹。 */
const ENTER_DURATION_S = 0.3;
/** 减弱动效下只留一次几乎察觉不到的透明度变化，避免内容硬切。 */
const REDUCED_DURATION_S = 0.12;

const ENTER_FROM = { opacity: 0, y: ENTER_OFFSET_PX };
/* 减弱动效：去掉位移，只留透明度 */
const ENTER_FROM_REDUCED = { opacity: 0, y: 0 };
const ENTER_TO = { opacity: 1, y: 0 };
const ENTER_TRANSITION = {
	bounce: 0,
	duration: ENTER_DURATION_S,
	type: "spring",
} as const;
const REDUCED_TRANSITION = { duration: REDUCED_DURATION_S };

/*
 * 「本次会话是否已经画过第一帧」。只在浏览器里置位：服务端的模块作用域跨请求共享，
 * 在那边写会让第二个请求起就以为已经挂载过。effect 不在服务端跑，所以它在
 * 服务端恒为 false，SSR 与注水首帧算出的样式因此一致，不会触发 hydration 警告。
 */
let hasPaintedOnce = false;

/**
 * 本次挂载在「骨架 ↔ 就绪」这条链上的位置。
 *
 * - "pending": 路由 pendingComponent 里的那一份。
 * - "ready": 同一条路由的就绪态。
 *
 * 两端是对称的：各自登记「这条路径的这一份正摆在屏幕上」，也各自去问「同一条路径的
 * 另一份刚才是不是就在屏幕上」。对称是必需的，因为这条链两个方向都会走：跨页导航走
 * 骨架 → 就绪，而列表页改筛选走就绪 → 骨架 → 就绪。
 *
 * 不传表示不在链上，行为与没有这个开关时完全一致：/login、脑图页、404 属于这一类。
 * 两端必须成对标注才有意义，只标一边不会改变任何行为。
 */
export type PageTransitionPhase = "pending" | "ready";

/*
 * 「此刻屏幕上摆着哪条路径的哪一份」：两个 phase 各占一格，那一格空着就是 null。
 *
 * 为什么需要这条模块级通道：路由的 pendingComponent 与就绪态是两个不同的组件类型，
 * 路由在两者之间切换必然卸载一棵子树、再挂载另一棵，PageTransition 的 key={pathname}
 * 拦不住——key 只在同一位置的同类型元素之间保持身份。于是一次超过 defaultPendingMs
 * （router.tsx，200ms）的导航会播两遍进场：骨架淡入一次，真内容再淡入一次。两棵互不
 * 相识的子树之间要传「这一跳的进场已经播过了」，除了模块作用域没有别的落点。
 *
 * 为什么两端都登记、也都读，而不是只让骨架登记、只让就绪读：列表页的 loaderDeps 取自
 * URL search，改筛选、切模块、翻页都会重跑 loader，超时同样会把 pendingComponent 换上
 * 来。这类操作 pathname 压根没变，属于页内操作，一次进场都不该播；可那一份骨架仍是全新
 * 挂载，只有反过来问一句「同一条 pathname 的就绪态刚才是不是就在屏幕上」才压得住它。
 * 两格分开放而不是共用一个变量：卸载 cleanup 与挂载 effect 在同一次提交里前后脚跑，共用
 * 一格时「谁清谁写」要靠执行顺序才成立；各写各的格子，顺序怎么排都不会互相抹掉。
 *
 * 为什么记 pathname 而不是一个布尔：骨架亮着的时候用户随时可以再点走。若只记布尔，
 * 那次真正的跨页导航会被当成「接在骨架后面」而被吞掉进场——页面之间的切换恰恰是这
 * 套动画唯一该出现的时机。记下路径，判定就变成「同一条 pathname 的某一份刚才就在屏幕
 * 上」：页内来回时两格里存的是同一条路径，压得住；跨页时两格存的都是旧路径，一格都对
 * 不上，进场照播——loader 秒回、根本没挂过骨架的那种跨页导航也照播。
 *
 * 与上面的 hasPaintedOnce 同样只在浏览器的 effect 里写。服务端的模块作用域跨请求
 * 共享，在那边写会让后续请求以为屏幕上摆着东西；而 effect 不在服务端跑，于是两格在
 * 服务端恒为 null，SSR 与注水首帧读到的都是 null，两边算出的 initial 一致。
 */
const onScreenPathname: Record<PageTransitionPhase, string | null> = {
	pending: null,
	ready: null,
};

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
	 * 骨架照样是全新挂载。页内操作之所以一次都不淡入，靠的是上面 onScreenPathname 那条
	 * 通道而不是这个 key；pathname 在这里同时兼任「算不算同一页」的判定粒度。
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
 * 两端共用的登记：挂载期间宣告「这条路径的这一份正摆在屏幕上」，卸载时撤销。
 *
 * 为什么写在 effect 而不是渲染里：渲染阶段写模块变量在服务端会跨请求泄漏（见
 * onScreenPathname 上方那段），并发渲染下还可能把值写在一次会被丢弃的渲染上。
 * 撤销放在 cleanup 里，语义正好就是「这一份从屏幕上撤下来了」。
 *
 * 撤销前先核对那一格里存的还是不是自己写进去的路径：StrictMode 会把 effect 跑成
 * 「挂载 → 卸载 → 再挂载」，无条件清就会把第二次挂载刚写好的值抹掉。核对之后，这段
 * 的正确性不再依赖 React 跑 cleanup 与 effect 的先后顺序。
 *
 * 依赖里的两个值在本次挂载内恒定（pathname 变了就是换 key 的另一次挂载），
 * 所以这段实际只在挂载与卸载各跑一次。
 */
function useOnScreenRegistration(
	pathname: string,
	phase: PageTransitionPhase | undefined
) {
	useEffect(() => {
		if (phase) {
			onScreenPathname[phase] = pathname;
		}
		return () => {
			if (phase && onScreenPathname[phase] === pathname) {
				onScreenPathname[phase] = null;
			}
		};
	}, [pathname, phase]);
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
	 * 一页内部的一次重挂（骨架与就绪互换），不是页面之间的切换。两格都要问：接在骨架后
	 * 面的就绪问的是 pending 那格，被筛选打断、顶上来的那份骨架问的是 ready 那格。
	 *
	 * 没标 phase 的页面（/login、脑图页、404）直接算作不在链上：它们从不登记，也就不去
	 * 读别人的登记，行为与没有这套机制时完全一致。
	 *
	 * 在 useState 的初始化函数里读，也就是在渲染阶段读，这一点是必需的：React 先
	 * 渲染新子树、提交时才跑旧子树的卸载 cleanup，所以此刻前一份的登记还在，读得到。
	 * 换到 effect 里读就晚了一步，那时 cleanup 已经把它清成 null。
	 *
	 * 只读不清：初始化函数在 StrictMode 下会被调用两次，若在这里顺手清掉标记，第二
	 * 次就会读成 null，同一次挂载先算出「跳过」又算出「要播」。清理归登记方的 cleanup。
	 */
	const [followsSamePath] = useState(
		() =>
			phase !== undefined &&
			(onScreenPathname.pending === pathname ||
				onScreenPathname.ready === pathname)
	);

	useEffect(() => {
		hasPaintedOnce = true;
	}, []);

	useOnScreenRegistration(pathname, phase);

	const enterFrom = shouldReduceMotion ? ENTER_FROM_REDUCED : ENTER_FROM;
	/*
	 * 两条互相独立的「这次不播」，理由不同但结果一样：首帧是「压根没发生页面切换」，
	 * 接同一页是「这一页已经在屏幕上了，这次重挂只是骨架与真内容互换」——跨页那一跳的
	 * 进场已经由先到的那一份播过，而筛选引发的就绪 → 骨架 → 就绪从头到尾都不该播。
	 * 两者都只压 initial，绝不去碰 animate 与 transition——原因见下面那段。
	 */
	const skipEnter = isFirstPaint || followsSamePath;

	return (
		/*
		 * animate 无论如何都是同一个终态：减弱动效只改 initial 与 transition。
		 * 两者若连终态也不同，服务端（永远算作不减弱）与客户端就会渲染出不同的
		 * style 属性，注水时报不一致。
		 *
		 * tabIndex=-1：「跳到主要内容」把焦点真正落进 main，否则 Tab 会从页首继续。
		 *
		 * PageEnterProvider 只是把上面这两个判定原样发给愿意接的子元素
		 * （见 page-stagger.tsx 的 StaggerItem）：想让子元素依次出现的页面，
		 * 与「这次该不该播进场」必须是同一个答案，否则改筛选那种页内操作会退化成
		 * 每一项各自淡入一遍。它不渲染任何 DOM，上面那条高度链不受影响。
		 *
		 * useReducedMotion() 在服务端与首帧可能是 null，这里收敛成 false：
		 * 那两种时刻 skipEnter 恒为 true，子元素本来就不动，取值影响不到任何输出。
		 */
		<motion.main
			animate={ENTER_TO}
			className={className}
			id="main"
			initial={skipEnter ? false : enterFrom}
			tabIndex={-1}
			transition={shouldReduceMotion ? REDUCED_TRANSITION : ENTER_TRANSITION}
		>
			<PageEnterProvider
				reduceMotion={shouldReduceMotion ?? false}
				skipEnter={skipEnter}
			>
				{children}
			</PageEnterProvider>
		</motion.main>
	);
}

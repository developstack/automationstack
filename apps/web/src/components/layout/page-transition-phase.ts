import { useEffect } from "react";

/**
 * 「骨架 ↔ 就绪」这条链的判定，从 page-transition.tsx 拆出来的一份。
 *
 * 拆分纯粹是因为行数：那边光是解释这条链为什么必须这么写就占掉七十多行，合在一起
 * 超过 scripts/check-file-rules.js 的 300 行上限。对外的 PageTransitionPhase 仍由
 * page-transition.tsx 原样再导出，调用方的 import 路径一个字都不用改。
 */

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
 * 只在浏览器的 effect 里写。服务端的模块作用域跨请求共享，在那边写会让后续请求以为
 * 屏幕上摆着东西；而 effect 不在服务端跑，于是两格在服务端恒为 null，SSR 与注水首帧
 * 读到的都是 null，两边算出的 initial 一致。
 */
const onScreenPathname: Record<PageTransitionPhase, string | null> = {
	pending: null,
	ready: null,
};

/**
 * 「这条 pathname 的某一份此刻就摆在屏幕上」。
 *
 * 必须在渲染阶段读（调用点是 useState 的初始化函数）：React 先渲染新子树、提交时才跑
 * 旧子树的卸载 cleanup，所以此刻前一份的登记还在，读得到；换到 effect 里读就晚了一步。
 *
 * 只读不清：初始化函数在 StrictMode 下会被调用两次，若在这里顺手清掉标记，第二次就会
 * 读成 null，同一次挂载先算出「跳过」又算出「要播」。清理归登记方的 cleanup。
 */
export function isPathnameOnScreen(pathname: string): boolean {
	return (
		onScreenPathname.pending === pathname || onScreenPathname.ready === pathname
	);
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
export function useOnScreenRegistration(
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

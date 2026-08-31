import { flushSync } from "react-dom";

/**
 * 主题明暗切换的圆形揭示：从点击处铺开一层新主题，盖住旧主题的整页快照。
 *
 * 走 View Transitions API 而不是自己叠两层 DOM：要盖住的是「整页在旧主题下的样子」，
 * 而颜色是靠 <html> 上一个类翻的，没有第二份 DOM 可以拿来当旧的那一层。
 * startViewTransition 恰好白送这份快照——它冻结旧画面、执行回调、再拿新画面，
 * 我们只需要给新画面挂一张会长大的遮罩。
 *
 * 与 page-transition.tsx 的分工：那边刻意**不用** View Transitions（理由写在那个
 * 文件里，核心是转场会推迟内容可见）；这边正相反，用户不是在等内容，是在看颜色翻面，
 * 旧快照本身就是要被揭开的那一层。两处结论不同，是因为两处要解决的问题不同。
 *
 * CSS 在 packages/ui/src/styles/view-transition.css：遮罩长什么样、默认交叉淡入怎么
 * 关掉都在那边。本文件只负责判定能不能播、算圆心与半径、驱动那一段动画。
 */

/** 挂在 <html> 上的开关类，样式全部限定在它之下。 */
const TRANSITION_CLASS = "theme-transitioning";

/** 要驱动的伪元素：新主题那一层。旧那层整段静止不动。 */
const NEW_ROOT_PSEUDO = "::view-transition-new(root)";

/**
 * 揭示时长 820ms、缓动 easeOutExpo。
 *
 * 比页面进场的 180ms 长得多，是刻意的：翻主题是低频的一次性动作，用户点完就是要
 * 看它铺开；导航是高频动作，动画长了就开始挡手。同一条 cubic-bezier(0.16, 1, 0.3, 1)
 * 两处共用——前三成时间走掉九成距离，圆一出手就冲出去，最后一截贴着边界收住。
 */
const DURATION_MS = 820;
const EASING = "cubic-bezier(0.16, 1, 0.3, 1)";

/**
 * 半径冗余系数。
 *
 * 圆心到视口最远角的距离只保证「圆的外沿」够到角落，而遮罩的纯黑区只到半径的 84%
 * （见 view-transition.css），剩下 16% 是羽化带。1.25 让纯黑区在收尾时达到
 * 1.25 × 0.84 ≈ 1.05 倍的所需半径：角落在动画结束前就已经是完全不透明的新主题，
 * 不会在最后一帧留下一小块半透明。
 */
const RADIUS_OVERSHOOT = 1.25;

/** 取矩形中心用。写成常量是因为 no-magic-numbers 只放行 -1 / 0 / 1。 */
const HALF = 0.5;

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

export interface ThemeTransitionOrigin {
	x: number;
	y: number;
}

/**
 * 点击事件里我们真正需要的那三样。
 *
 * 刻意写成结构类型而不是 React.MouseEvent<...>：两个调用点一个是 <Button>
 * （HTMLButtonElement），一个是下拉菜单项（Base UI 渲染成 div），各自的事件类型不同，
 * 但都能赋给这个形状。这样两处都不必为了对齐类型去改 JSX。
 */
export interface ThemeTransitionClick {
	clientX: number;
	clientY: number;
	currentTarget: EventTarget | null;
}

function viewportCenter(): ThemeTransitionOrigin {
	return { x: window.innerWidth * HALF, y: window.innerHeight * HALF };
}

/**
 * 从点击事件里取圆心。
 *
 * 三档回退，从准到糙：
 * 1. 真的用鼠标/触摸点的：clientX/clientY 就是手指落点，圆从那里长出来。
 * 2. 键盘触发的（Enter/Space）：浏览器仍然派发 click，但坐标是 0,0——那是视口左上角，
 *    圆会从屏幕角上冒出来，明显不对。这时改用控件自身的中心，圆从那颗按钮长出来，
 *    与鼠标点它的观感一致。这一档同时兜住了下拉菜单项那个入口的键盘操作。
 * 3. 连 currentTarget 都不是元素（理论上不该发生）：退到视口中心，至少是对称的。
 *
 * 用 `!== 0` 判定而不是 event.detail === 0：某些输入法与辅助技术派发的合成点击
 * detail 也是 0 却带着有效坐标，那种情况按坐标走才是对的。
 */
export function originFromEvent(
	event: ThemeTransitionClick
): ThemeTransitionOrigin {
	if (event.clientX !== 0 || event.clientY !== 0) {
		return { x: event.clientX, y: event.clientY };
	}
	const target = event.currentTarget;
	if (target instanceof Element) {
		const rect = target.getBoundingClientRect();
		return {
			x: rect.left + rect.width * HALF,
			y: rect.top + rect.height * HALF,
		};
	}
	return viewportCenter();
}

/**
 * 这次切换能不能播动画。任何一条不满足就直接翻主题，绝不因此不翻。
 *
 * - 没有 document（SSR / 测试环境里的 node）。
 * - 浏览器没有 View Transitions API（较旧的 Firefox、Safari 18 以前）。这是降级，
 *   不是可选项：这些浏览器照样要能切换明暗。
 * - 用户要求减弱动效：**直接没有动画，不是动得慢一点**。这里刻意用 JS 判定而不是
 *   在 CSS 里再写一条 prefers-reduced-motion 规则——两套判定并存，迟早在某个组合下
 *   （比如动画已经开播、类名已经挂上）互相说不同的话。判定只有这一处。
 */
function canReveal(): boolean {
	return (
		typeof document !== "undefined" &&
		typeof document.startViewTransition === "function" &&
		!window.matchMedia(REDUCED_MOTION_QUERY).matches
	);
}

/**
 * 圆心到视口四角的最远距离，再乘冗余系数。
 *
 * max(x, w - x) 取的是圆心到左右两边中较远的那一边，纵向同理；两者的斜边就是最远角。
 */
function revealRadius(origin: ThemeTransitionOrigin): number {
	const dx = Math.max(origin.x, window.innerWidth - origin.x);
	const dy = Math.max(origin.y, window.innerHeight - origin.y);
	return Math.hypot(dx, dy) * RADIUS_OVERSHOOT;
}

/**
 * 把遮罩从点击处那个点长成盖住整个视口的圆。
 *
 * 动的只有 mask-size 与 mask-position，两者都不影响布局，也不触发重排；遮罩本身是
 * 合成阶段的操作。刻意不写 transition: all，也不去动 width/height/top。
 *
 * mask-position 必须跟着一起动：mask-size 是从左上角量的，只放大尺寸会让圆的圆心
 * 一路往右下漂。让位置同步退到 (x - r, y - r)，圆心才始终钉在点击处。
 */
function playReveal(origin: ThemeTransitionOrigin): void {
	const radius = revealRadius(origin);
	const diameter = radius + radius;
	document.documentElement.animate(
		{
			maskPosition: [
				`${origin.x}px ${origin.y}px`,
				`${origin.x - radius}px ${origin.y - radius}px`,
			],
			maskSize: ["0px 0px", `${diameter}px ${diameter}px`],
		},
		{
			duration: DURATION_MS,
			easing: EASING,
			/*
			 * fill: forwards 是防最后一帧闪白（或闪黑）的。动画结束后计算值会退回
			 * view-transition.css 里写死的 mask-size: 0 0，而伪元素要等
			 * transition.finished 之后才被移除——中间那一两帧新主题会整层消失，
			 * 露出下面那张旧主题的快照，看起来就是揭示到底之后突然弹回旧配色。
			 * 保持终态，直到伪元素连同这段动画一起被撤掉。
			 */
			fill: "forwards",
			pseudoElement: NEW_ROOT_PSEUDO,
		}
	);
}

/*
 * 同时在飞的切换次数。连点两下时第二次 startViewTransition 会让第一次直接跳到结束，
 * 于是第一次的 finished 先兑现；只要无条件摘类名，第二次的揭示就会当场失去全部样式，
 * 退化成一次硬切。计数归零才摘。
 */
let activeReveals = 0;

function endReveal(): void {
	activeReveals -= 1;
	if (activeReveals === 0) {
		document.documentElement.classList.remove(TRANSITION_CLASS);
	}
}

/**
 * 执行一次主题切换，可能带圆形揭示。
 *
 * apply 是真正翻主题的那一下（改 <html> 的类 + 通知订阅者），由调用方传进来：
 * 本文件不认识主题，只认识「什么时候把这件事做掉」。
 *
 * 为什么 apply 外面裹一层 flushSync：startViewTransition 在回调返回（并且返回的
 * promise 兑现）之后立刻抓新画面的快照。apply 里的 notify() 走的是
 * useSyncExternalStore 的订阅回调，React 会把重渲染排进自己的调度，那次提交多半落在
 * 快照之后——结果就是圆已经铺开了、按钮上的图标才慢半拍换过来，而且是硬换。
 * flushSync 把这次提交压成同步的，快照里带的就是已经换好的图标。
 */
export function runThemeTransition(
	origin: ThemeTransitionOrigin | null,
	apply: () => void
): void {
	if (!canReveal()) {
		apply();
		return;
	}
	document.documentElement.classList.add(TRANSITION_CLASS);
	activeReveals += 1;
	const transition = document.startViewTransition(() => {
		flushSync(apply);
	});
	transition.finished.then(endReveal, endReveal);
	/*
	 * ready 在转场被跳过时会 reject（比如同时又来了一次切换，或者页面隐藏）。
	 * 这时不播揭示就是对的，类名交给上面那条 finished 摘；这里只是别让它变成
	 * 未处理的 rejection。
	 */
	transition.ready.then(() => playReveal(origin ?? viewportCenter()), noop);
}

function noop(): void {
	// ready 被拒绝时无事可做，见调用处注释
}

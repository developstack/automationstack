/**
 * 空白画布上的左键拖拽平移。
 *
 * ## 为什么必须自己接管
 *
 * mind-elixir@5.15.1 的 pointerdown 分发器（MindElixir.js:1150）第一件事是
 * `if (editable && target.className === "map-container" && button === 0 && pointerType === "mouse") { ptState = BoxSelect; return }`
 * —— 早退发生在 `panHelper.handlePointerDown` **之前**，所以左键按在空白画布上
 * 永远走不到平移分支。就算绕过它，`panHelper`（MindElixir.js:2777）也只认
 * `button === (mouseSelectionButton === 0 ? 2 : 0)`，默认即右键。把
 * `mouseSelectionButton` 改成 2 并不能解决：上面那个早退把 `button === 0` 写死了，
 * 根本不读这个选项，只会把框选挪到右键去跟右键菜单打架。净结果是桌面端只剩
 * 「右键拖 / 空格+左键拖 / 滚轮」，且全都没有任何可见提示。
 *
 * ## 接管方式
 *
 * 监听器绑在 React 持有的外层容器（`.map-container` 的父节点）的**捕获阶段**：
 * 祖先的捕获一定早于目标节点上的任何监听器，不依赖注册顺序。确认接管后
 * `stopPropagation()`，于是
 * - mind-elixir 绑在 `.map-container` 冒泡阶段的分发器不会跑（`ptState` 保持
 *   Idle，它的 pointermove / pointerup 分支因此全部空转，不会和这里抢状态）；
 * - 框选库绑在 `document` 冒泡阶段的 pointerdown 也不会跑（MindElixir.js:1737）。
 *
 * 代价是框选库的 `beforestart` 不再执行，而「点空白取消选中」恰恰写在那里面
 * （MindElixir.js:2064 的 `!ctrlKey && !metaKey && clearSelection()`），所以这里
 * 必须自己补上：按下到抬起之间位移没超过 slop 就算一次点击，调 `clearSelection()`。
 * 顺带修掉了原行为的一个毛病——原实现在 pointerdown 就清，拖动画布也会顺手把
 * 选中态清掉。
 *
 * 位移本身交给 `mind.move(dx, dy)`（MindElixir.js:748）：它自带边界钳制（内容
 * 边缘最多拖到容器中心为止），这里不必自己算可视范围。逐帧传增量而不是累计量，
 * 与 `panHelper` 的语义一致：钳制发生后指针继续移动不会攒出一段"欠账"。
 */

import type { MindElixirInstance } from "mind-elixir";

/** 按下到抬起的位移不超过这个像素数，就算点击而不是拖拽。取值同 mind-elixir 自己的长按判定阈值。 */
const CLICK_SLOP_PX = 5;

/** `PointerEvent.button` 的主键。 */
const PRIMARY_BUTTON = 0;

/** 只接管鼠标（含触控板）；触屏与手写笔仍走 mind-elixir 自己的分支。 */
const MOUSE_POINTER = "mouse";

/** 拖拽期间挂在 `.map-container` 上的标记类，唯一用途是换光标（见 mindmap-pan.css）。 */
export const MINDMAP_PANNING_CLASS = "mindmap-panning";

/**
 * 一次指针事件里这里用得到的字段。`PointerEvent` 结构上满足它，所以 DOM 层
 * 可以直接把事件传进来；而 `target` 声明成 `unknown`，测试就能在 node 环境下
 * 用普通值当替身（本仓库的 vitest 是 node 环境，没有 DOM）。
 */
export interface MindmapPanPointer {
	button: number;
	clientX: number;
	clientY: number;
	ctrlKey: boolean;
	metaKey: boolean;
	pointerId: number;
	pointerType: string;
	target: unknown;
}

/** 控制器要驱动的外部效果，全部由 DOM 层注入。 */
export interface MindmapPanEffects {
	capturePointer: (pointerId: number) => void;
	/** 只有按在空白画布（`.map-container` 自身）上才接管：按在节点上是节点拖拽。 */
	isCanvasTarget: (target: unknown) => boolean;
	move: (dx: number, dy: number) => void;
	/** 位移未超过 slop 的一次按下 = 点了空白，语义是取消选中。 */
	onCanvasClick: () => void;
	releasePointer: (pointerId: number) => void;
	setPanning: (panning: boolean) => void;
}

export interface MindmapPanController {
	/** 指针被取消（系统手势 / 失焦）：只收尾，不当作点击。 */
	cancel: () => void;
	/** 返回 true 表示已接管，调用方负责 `stopPropagation()`。 */
	down: (pointer: MindmapPanPointer) => boolean;
	drag: (pointer: MindmapPanPointer) => void;
	end: (pointer: MindmapPanPointer) => void;
}

interface PanState {
	/** 按下时按了 Ctrl/Cmd：与框选库一致，这一下不清选中（那是加选手势）。 */
	keepSelection: boolean;
	lastX: number;
	lastY: number;
	moved: boolean;
	originX: number;
	originY: number;
	pointerId: number;
}

function canStartPan(
	pointer: MindmapPanPointer,
	effects: MindmapPanEffects
): boolean {
	return (
		pointer.button === PRIMARY_BUTTON &&
		pointer.pointerType === MOUSE_POINTER &&
		effects.isCanvasTarget(pointer.target)
	);
}

function toPanState(pointer: MindmapPanPointer): PanState {
	return {
		keepSelection: pointer.ctrlKey || pointer.metaKey,
		lastX: pointer.clientX,
		lastY: pointer.clientY,
		moved: false,
		originX: pointer.clientX,
		originY: pointer.clientY,
		pointerId: pointer.pointerId,
	};
}

function exceedsSlop(state: PanState, pointer: MindmapPanPointer): boolean {
	const dx = pointer.clientX - state.originX;
	const dy = pointer.clientY - state.originY;
	return Math.hypot(dx, dy) > CLICK_SLOP_PX;
}

/**
 * 一次控制器实例的全部可变状态。原来它是 `createMindmapPanController` 里的
 * 一个闭包变量，为了把各个处理器搬到模块作用域，这里把它连同 effects 一起
 * 装进一个盒子按引用传递——处理器改的仍是同一份状态，时序与原来完全一致。
 */
interface PanSession {
	effects: MindmapPanEffects;
	state: PanState | null;
}

/** 结束当前拖拽并交出它的终态；没有在拖就返回 null。 */
function settle(session: PanSession): PanState | null {
	if (session.state === null) {
		return null;
	}
	const finished = session.state;
	session.state = null;
	session.effects.setPanning(false);
	return finished;
}

/** 事件属于当前这次拖拽吗（多指针同时按下时只认发起的那一个）。 */
function owns(session: PanSession, pointer: MindmapPanPointer): boolean {
	return (
		session.state !== null && session.state.pointerId === pointer.pointerId
	);
}

/** pointerdown：能接管就记下起点并抓住指针，返回值即「是否接管」。 */
function handleDown(session: PanSession, pointer: MindmapPanPointer): boolean {
	if (session.state !== null || !canStartPan(pointer, session.effects)) {
		return false;
	}
	session.state = toPanState(pointer);
	session.effects.capturePointer(pointer.pointerId);
	session.effects.setPanning(true);
	return true;
}

/** pointermove：按逐帧增量驱动 move，并记录这次按下是否已经越过 slop。 */
function handleDrag(session: PanSession, pointer: MindmapPanPointer): void {
	// 取局部别名只为保住 TS 的 null 收窄；PanState 是对象，改它就是改 session.state
	// 指向的同一个对象，不存在拷贝。
	const { state } = session;
	if (state === null || !owns(session, pointer)) {
		return;
	}
	const dx = pointer.clientX - state.lastX;
	const dy = pointer.clientY - state.lastY;
	state.lastX = pointer.clientX;
	state.lastY = pointer.clientY;
	state.moved = state.moved || exceedsSlop(state, pointer);
	session.effects.move(dx, dy);
}

/** pointerup：收尾；没拖动过又没按 Ctrl/Cmd，就补上「点空白取消选中」。 */
function handleEnd(session: PanSession, pointer: MindmapPanPointer): void {
	if (!owns(session, pointer)) {
		return;
	}
	session.effects.releasePointer(pointer.pointerId);
	const finished = settle(session);
	if (finished !== null && !(finished.moved || finished.keepSelection)) {
		session.effects.onCanvasClick();
	}
}

/**
 * 平移的纯状态机。DOM 细节（绑在哪、要不要 stopPropagation）留给
 * `bindMindmapPan`，这样这一层可以在没有 DOM 的测试环境里跑。
 */
export function createMindmapPanController(
	effects: MindmapPanEffects
): MindmapPanController {
	const session: PanSession = { effects, state: null };

	return {
		cancel: () => {
			settle(session);
		},
		down: (pointer) => handleDown(session, pointer),
		drag: (pointer) => {
			handleDrag(session, pointer);
		},
		end: (pointer) => {
			handleEnd(session, pointer);
		},
	};
}

/** 捕获阶段：祖先的捕获一定早于 mind-elixir 绑在 `.map-container` 上的分发器。 */
const CAPTURE: AddEventListenerOptions = { capture: true };

/** 把控制器的效果接到真实实例上。 */
function createPanEffects(mind: MindElixirInstance): MindmapPanEffects {
	const canvas = mind.container;
	return {
		capturePointer: (pointerId) => {
			canvas.setPointerCapture(pointerId);
		},
		isCanvasTarget: (target) => target === canvas,
		move: (dx, dy) => {
			mind.move(dx, dy);
		},
		onCanvasClick: () => {
			mind.clearSelection();
		},
		releasePointer: (pointerId) => {
			// pointercancel 之后浏览器已经隐式释放过，再释放一次会抛。
			if (canvas.hasPointerCapture(pointerId)) {
				canvas.releasePointerCapture(pointerId);
			}
		},
		setPanning: (panning) => {
			canvas.classList.toggle(MINDMAP_PANNING_CLASS, panning);
		},
	};
}

/**
 * 把平移接到一个活着的实例上，返回解绑函数。
 *
 * `root` 是 React 持有的外层容器，也就是 `new MindElixir({ el })` 里的那个 `el`；
 * 它是 `.map-container` 的父节点，所以在它上面捕获一定早于库自己的监听器。
 * 解绑函数由 `useMindElixirInstance` 的 teardown 调用，与实例同生共死。
 */
export function bindMindmapPan(
	root: HTMLElement,
	mind: MindElixirInstance
): () => void {
	const controller = createMindmapPanController(createPanEffects(mind));
	const onPointerDown = (event: PointerEvent) => {
		if (controller.down(event)) {
			event.stopPropagation();
		}
	};
	// 移动 / 抬起不拦截：此时 mind-elixir 的分发器按 ptState=Idle 空转，让它照常
	// 收到事件，它自己的双击检测等内部状态才不会错位。
	const onPointerMove = (event: PointerEvent) => {
		controller.drag(event);
	};
	const onPointerUp = (event: PointerEvent) => {
		controller.end(event);
	};
	const onPointerCancel = () => {
		controller.cancel();
	};

	root.addEventListener("pointerdown", onPointerDown, CAPTURE);
	root.addEventListener("pointermove", onPointerMove, CAPTURE);
	root.addEventListener("pointerup", onPointerUp, CAPTURE);
	root.addEventListener("pointercancel", onPointerCancel, CAPTURE);
	return () => {
		controller.cancel();
		root.removeEventListener("pointerdown", onPointerDown, CAPTURE);
		root.removeEventListener("pointermove", onPointerMove, CAPTURE);
		root.removeEventListener("pointerup", onPointerUp, CAPTURE);
		root.removeEventListener("pointercancel", onPointerCancel, CAPTURE);
	};
}

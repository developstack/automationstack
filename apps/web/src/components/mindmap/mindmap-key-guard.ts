/**
 * 屏蔽 mind-elixir 那几个会重建整棵画布的快捷键。
 *
 * ## 为什么必须屏蔽
 *
 * 画布成文依赖 `direction: DIRECTION_RIGHT`（见 mindmap-canvas.tsx）：只有右侧
 * 布局下兄弟节点的顺序才 1:1 对应后端的 `sortOrder`。而 `initLeft` / `initRight`
 * / `initSide`（MindElixir.js:777-783）都是
 * `this.direction = N, this.refresh(), this.toCenter()` —— `refresh()` 整棵重建
 * DOM，顺带清掉选中态和手动展开态。左上角工具栏那条路已经由
 * mindmap-toolbar.ts 摘掉，剩下的就是键盘：`init()` 里
 * `this.keypress && In(this, this.keypress)`（MindElixir.js:2755，`keypress`
 * 默认 true，见 2865 行 `this.keypress = r ?? !0`）。
 *
 * ## 接管方式
 *
 * 库的处理器是**属性赋值**挂在 `.map-container` 上的
 * （MindElixir.js:998 `e.container.onkeydown = ...`），属性处理器等价于目标节点
 * 上的一个冒泡阶段监听器，没法用 `removeEventListener` 精确摘除，也没法靠注册
 * 顺序抢先。所以这里跟 mindmap-pan.ts 用同一套路：绑在 React 持有的外层容器
 * （`.map-container` 的父节点）的**捕获阶段**——祖先的捕获必定早于目标节点上的
 * 任何处理器，且不依赖注册顺序——命中后 `stopPropagation()`，事件根本走不到
 * `.map-container`。
 *
 * ## 拦下来之后必须自己补 preventDefault()
 *
 * 这是这个改动里最容易漏的一点。库的处理器**开头**有一句无差别的
 * `preventDefault()`（MindElixir.js:999，只对 Ctrl/Cmd + c/v/x 让路），而且排在
 * `e.editable` 判断之前。我们把事件拦掉之后那句就不执行了，于是 macOS 下
 * `Cmd + ←` 会落到浏览器原生的「后退」上，直接把用户带离页面；`Cmd + →` 同理
 * 是「前进」。所以拦截的同时必须自己调 `preventDefault()`。
 */

/**
 * 一次键盘事件里这里用得到的字段。`KeyboardEvent` 结构上满足它，所以 DOM 层
 * 可以直接把事件传进来；而这一层不碰任何 DOM API，测试就能在 node 环境下用
 * 普通对象当替身（本仓库的 vitest 是 node 环境，见根 vitest.config.ts）。
 */
export interface MindmapKeyEvent {
	altKey: boolean;
	ctrlKey: boolean;
	key: string;
	metaKey: boolean;
	/**
	 * 目前不参与判定，列在这里是为了让这个形状完整覆盖修饰键：库的三个方向键
	 * 分支都没读 shiftKey（Cmd+Shift+← 照样进 initLeft，一样要拦），而 `k` 那条
	 * 路加 Shift 后 `event.key` 本身就变成了 "K"，库的键位表查不到，自然不会触发。
	 */
	shiftKey: boolean;
}

/**
 * 库的键位表是按 `event.key` 索引的（MindElixir.js:998 `const d = l[c.key]`），
 * 所以这里比的也是 `key` 而不是 `code`，大小写要和表里的字面量一致。
 */

/** Cmd/Ctrl + ← / → → initLeft / initRight（MindElixir.js:962-971）。 */
const LAYOUT_KEYS_IGNORING_ALT = new Set(["ArrowLeft", "ArrowRight"]);

/** Cmd/Ctrl + ↑ → initSide（MindElixir.js:940-952）。 */
const SIDE_LAYOUT_KEY = "ArrowUp";

/**
 * Cmd/Ctrl + K（MindElixir.js:989-991）。它不改 `direction`，但会打开一个 2 秒
 * 的「折叠到第 N 层」模式：往 `.map-container` 上再挂一个 keydown 监听器
 * （MindElixir.js:907-923），随后按下的 `0` / `=` / `1`-`9` 会批量改写整棵树的
 * `expanded` 再 `refresh() + toCenter()`，同样清掉选中态和手动展开态。
 */
const LAYER_COLLAPSE_KEY = "k";

/**
 * 这一下键盘要不要拦掉。
 *
 * altKey 只在 `ArrowUp` 上有意义：库的 ArrowUp 分支是
 * `if (c.altKey) e.moveUpNode(); else { if (c.metaKey || c.ctrlKey) return e.initSide(); ... }`
 * —— alt 优先，所以 Cmd/Ctrl + Alt + ↑ 走的是 moveUpNode（上移节点，要保留），
 * 不能拦。而 ArrowLeft / ArrowRight 的分支里**根本没有 altKey 判断**，带不带
 * alt 都会进 initLeft / initRight，所以照拦不误。
 *
 * 不拦的：不带修饰键的方向键（那是节点导航）、Cmd/Ctrl + ↓（库的 ArrowDown
 * 分支没有方向布局的路径）、以及 Tab / Enter / Delete / F1 / F2 等其它键。
 */
export function shouldBlockMindmapKey(event: MindmapKeyEvent): boolean {
	if (!(event.metaKey || event.ctrlKey)) {
		return false;
	}
	if (event.key === SIDE_LAYOUT_KEY) {
		return !event.altKey;
	}
	return (
		LAYOUT_KEYS_IGNORING_ALT.has(event.key) || event.key === LAYER_COLLAPSE_KEY
	);
}

/** 捕获阶段：祖先的捕获一定早于 mind-elixir 挂在 `.map-container` 上的处理器。 */
const CAPTURE: AddEventListenerOptions = { capture: true };

/**
 * 把屏蔽接到容器上，返回解绑函数。
 *
 * `root` 是 React 持有的外层容器，也就是 `new MindElixir({ el })` 里的那个 `el`；
 * 它是 `.map-container` 的父节点（MindElixir.js:2869 `this.el.appendChild(this.container)`），
 * 所以在它上面捕获一定早于库自己的处理器。解绑函数由 `useMindElixirInstance`
 * 的 teardown 调用，与实例同生共死。
 */
export function bindMindmapKeyGuard(root: HTMLElement): () => void {
	const onKeyDown = (event: KeyboardEvent) => {
		if (!shouldBlockMindmapKey(event)) {
			return;
		}
		// 顺序无所谓，但两句都不能少：preventDefault 挡浏览器的前进/后退，
		// stopPropagation 挡 mind-elixir 的处理器。
		event.preventDefault();
		event.stopPropagation();
	};

	root.addEventListener("keydown", onKeyDown, CAPTURE);
	return () => {
		root.removeEventListener("keydown", onKeyDown, CAPTURE);
	};
}

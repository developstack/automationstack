/**
 * Toolbar trimming for the mindmap canvas.
 *
 * mind-elixir@5.15.1 只有一个布尔开关 `Options.toolBar`（MindElixir.js:2755
 * `this.toolBar && no(this)`）：要么两排工具栏都建，要么一排都没有。没有办法
 * 只关掉其中一排，所以只能照 `pruneMindmapContextMenu` 的先例，在 `init()`
 * 之后把不要的那排从 DOM 里摘掉。
 *
 * 摘掉的是左上角 `.mind-elixir-toolbar.lt`。它的三个按钮的 onclick 分别是
 * `initLeft` / `initRight` / `initSide`（MindElixir.js:1559-1565），而这三个
 * 方法的函数体就是 `this.direction = 0|1|2; this.refresh(); this.toCenter()`
 * （MindElixir.js:777-783）。画布成文依赖 `direction: 1` —— 右侧布局下兄弟
 * 节点的顺序才 1:1 对应 `sortOrder`（见 mindmap-canvas.tsx），用户随手点一下
 * 就把这个前提改掉了；`refresh()` 还会整棵重建 DOM，顺带清掉选中态和手动
 * 展开态。
 *
 * 右下角 `.mind-elixir-toolbar.rb`（全屏 / 回到中心 / 缩小 / 放大）必须留着：
 * 「回到中心」是画出视野之后唯一的兜底出口（F1 绑的也是同一个 `toCenter`）。
 * 两排是 `no()` 分别 append 的两个独立 div，样式也各挂各的（MindElixir.css 里
 * `.mind-elixir-toolbar.rb` 与 `.mind-elixir-toolbar.lt` 是两条互不相干的
 * 规则），所以摘掉 `.lt` 不会影响 `.rb` 的存在、定位或点击。
 *
 * 注意 DOM 摘除拦不住键盘：`Cmd/Ctrl + ←/→/↑` 走的是同一批方法
 * （MindElixir.js:962-970）。那条路要不要堵是单独的决定，这里不处理。
 */

import type { MindElixirInstance } from "mind-elixir";

/** 左上角那排改布局方向的工具栏。 */
const DIRECTION_TOOLBAR_SELECTOR = ".mind-elixir-toolbar.lt";

/** 摘掉会改写 `direction` 的左上角工具栏，右下角的视图控制原样保留。 */
export function pruneMindmapToolbar(mind: MindElixirInstance): void {
	// 可选链而非断言：将来库升级把 class 名改了就静默跳过。画布本身照常可用，
	// 不该因为一排按钮没摘掉就抛异常把整个挂载搞挂。
	mind.container.querySelector(DIRECTION_TOOLBAR_SELECTOR)?.remove();
}

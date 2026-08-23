/**
 * 把 mind-elixir 的配色接到本仓库的设计令牌上。
 *
 * ## 为什么必须显式传 theme
 *
 * mind-elixir@5.15.1 的构造函数（MindElixir.js:2866）在没有 `theme` 选项时是
 * `this.theme = options.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? DARK_THEME : THEME)`
 * —— 它认的是**操作系统**偏好，而本仓库的外观由 `<html>` 上的 `.dark` 决定
 * （见 components/theme/use-theme.ts，用户可以显式覆盖系统）。系统暗色 + 应用亮色
 * 时两者就会劈叉：外壳变亮而画布仍是 DARK_THEME 的近黑（#252526）。
 *
 * ## 为什么切换主题时一行 JS 都不用跑
 *
 * `changeTheme` 的全部作用是把 `theme.cssVar` 的每一项
 * `container.style.setProperty(key, value)`（MindElixir.js:2130-2143），而
 * `palette` 只在 `linkDiv` 里被读成分支线的 `stroke` 与主节点的
 * `style.borderColor`。这两处最终都是 **CSS 值**，所以这里把值一律写成
 * `var(--token)`：变量在使用点才解析，`<html>` 上的 `.dark` 一加一撤，画布、节点、
 * 连线、浮动工具栏同一帧跟着变，不需要 React 重渲染，也不需要碰实例。
 *
 * 反过来说，走「JS 里解析出具体颜色 → `changeTheme()`」就必须付出代价：
 * `changeTheme(theme)` 的第二个参数 `shouldRefresh` **默认是 true**，会直接调
 * `this.refresh()` —— 那是 O(节点数) 的整树重建，2000 节点要几百毫秒，而且
 * `refresh` 第一行就 `clearSelection()`、并把用户手动展开的用例恢复成数据里的
 * 展开态（mindmap-redraw.ts 整个文件在补的就是这件事）。换成
 * `changeTheme(theme, false)` 仍要再补一次 `linkDiv()` 才能刷新分支色。
 * 纯 CSS 变量这条路把这些全绕开了：零 layout、零重建、零 TrailingMerge 交互。
 *
 * ## 颜色取值
 *
 * 全部来自 packages/ui/src/styles/theme.css，本文件不新造颜色。
 * `palette` 只有一个 `var(--primary)`：mind-elixir 默认用 10 色轮换给主分支上色，
 * 而本仓库的令牌里没有「一支能在亮暗两种底色上都过 3:1 的 10 色分支色板」——
 * packages/api 的 realtime/presence-color.ts 里 PRESENCE_COLOR_PALETTE 统一在 L=0.8，是为深色画布上的
 * 光标定的，且语义是「人」（theme.css 里 --success 选 139° 就是为了跟它拉开）。
 * 与其发明一套新色，不如让主分支统一用强调色，与全站「同一支蓝的浓淡」一致；
 * 代价是丢掉按模块区分颜色的能力，记在这里。
 */

import type { Theme } from "mind-elixir";

/**
 * 传给 `new MindElixir({ theme })` 的主题。
 *
 * `type` 只决定 mind-elixir 拿哪套内置 cssVar 当底（MindElixir.js:2132），
 * 下面已经把它的每一个**颜色**键都覆盖掉了，剩下继承的是间距 / 圆角 / 内边距，
 * 两套内置主题的这些几何值本来就一样。`--main-border` 内置值是空串，
 * `setProperty(key, "")` 等于删掉该变量，样式表里
 * `border: var(--main-border, 2px solid var(--main-color))` 于是走回退分支。
 */
export const MINDMAP_THEME: Theme = {
	cssVar: {
		// 未在 5.15.1 的样式表里出现，仅为补全类型语义而设。
		"--accent-color": "var(--primary)",
		// 画布底。
		"--bgcolor": "var(--background)",
		// 子节点（模块下的用例及其步骤）的正文色，压在画布底上。
		"--color": "var(--foreground)",
		"--main-bgcolor": "var(--card)",
		// 箭头标签的半透明底；透明度由 color-mix 从同一个令牌算出来。
		"--main-bgcolor-transparent":
			"color-mix(in oklab, var(--card) 80%, transparent)",
		// 主节点（模块）的文字，压在 --main-bgcolor 上。
		"--main-color": "var(--card-foreground)",
		// 浮动工具栏与右键菜单：与 popover 同一套面/前景。
		"--panel-bgcolor": "var(--popover)",
		"--panel-border-color": "var(--border)",
		"--panel-color": "var(--popover-foreground)",
		// 根节点（项目）是画布上唯一的实心强调块。
		"--root-bgcolor": "var(--primary)",
		"--root-border-color": "var(--border)",
		"--root-color": "var(--primary-foreground)",
		// 选中态是 2px outline，用途与焦点环一致，直接复用 --ring。
		"--selected": "var(--ring)",
	},
	name: "automationstack",
	// 分支线与主节点边框：非文本，按 WCAG 1.4.11 的 3:1 量。
	palette: ["var(--primary)"],
	type: "light",
};

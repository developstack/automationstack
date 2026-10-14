import type { Theme } from "mind-elixir";

/**
 * 脑图的配色只引用设计令牌，浅色和暗色模式跟着令牌切换。
 * 黑白主调：根节点接近黑色（暗色模式下接近白色），主节点是卡片，连线是中性灰。
 * 颜色只表示状态，所以连线和节点都不用状态色。
 * 圆角用 :root 上的 --radius 计算：Tailwind 只输出用到的 --radius-* 变量。
 */
export const MINDMAP_THEME: Theme = {
	cssVar: {
		"--accent-color": "var(--primary)",
		"--bgcolor": "var(--background)",
		"--color": "var(--foreground)",
		"--main-bgcolor": "var(--card)",
		"--main-bgcolor-transparent":
			"color-mix(in oklab, var(--card) 80%, transparent)",
		// mind-elixir 用 palette 的颜色覆盖主节点的边框色，这里写同一个颜色
		"--main-border": "1px solid var(--muted-foreground)",
		"--main-color": "var(--card-foreground)",
		"--main-radius": "calc(var(--radius) - 2px)",
		"--panel-bgcolor": "var(--popover)",
		"--panel-border-color": "var(--border)",
		"--panel-color": "var(--popover-foreground)",
		"--root-bgcolor": "var(--primary)",
		"--root-border-color": "var(--primary)",
		"--root-color": "var(--primary-foreground)",
		"--root-radius": "var(--radius)",
		"--selected": "var(--primary)",
		"--topic-padding": "4px 8px",
	},
	name: "automationstack",
	// 连线和主节点的边框色。达到非文字元素 3:1 的对比度
	palette: ["var(--muted-foreground)"],
	type: "light",
};

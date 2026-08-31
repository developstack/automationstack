import { useReducedMotion } from "motion/react";

/**
 * 相接的两块填充之间的分缝。
 *
 * --chart-2..5 是一套纯灰色阶（主题是 shadcn neutral，全仓 C=0），相邻两档互比只有
 * 1.65:1（2 对 3）、1.33:1（3 对 4）、1.45:1（4 对 5）——实测值见
 * packages/ui/src/styles/theme.css 里 --chart-1 那段注释。也就是说两块贴在一起的
 * 填充根本不能指望色差把自己分开，必须用卡片底色描一道 2px 的缝切开。
 * 这条不是装饰：扇区/柱体的边界就是读数的边界，边界看不见等于数读不出来。
 *
 * 走 var(--card) 而不是 var(--background)：这些图都长在 <Card> 里，卡片底比页面底浅一档，
 * 用页面底色描缝会在亮色下多出一道比卡片更暗的线。
 */
export const CHART_SEAM = { stroke: "var(--card)", strokeWidth: 2 } as const;

/**
 * 图表入场动画的时长与缓动。两张图共用，改这里就是同时改整页。
 *
 * recharts 的默认值对这一页是灾难：Pie 默认 1500ms（node_modules/recharts/lib/
 * polar/Pie.js:546），而概览页一次要画三个环，主内容区的进场只有 220ms
 * （page-transition.tsx 的 ENTER_DURATION_S）——文字第一帧就落位可读了，三个环
 * 还要再自转一秒多。同一份数据在同一张卡里给出两个「已经好了」的时刻。
 *
 * 400ms，随页面进场从 180ms 调到 220ms 之后重算过一遍，结论是**维持 400ms**：
 * 两条动画都从「真内容挂载」这一帧起算（页面进场是 motion 的 initial → animate，
 * 图表进场是 recharts 自己的 react-smooth），所以两者的差值就是「环比文字晚多久
 * 收尾」——原来是 400 − 180 = 220ms，现在是 400 − 220 = 180ms。缩了 40ms，仍在
 * 「视线还没离开这张卡」的量级里，读起来只会更紧凑一点。
 *
 * 跟着页面加到 440ms 则不划算：那只是为了守住 220ms 这个从来就是「约」的数字，
 * 代价是每次进概览都多等 40ms。维持 400ms 还顺带保住另一条：它正好是 recharts Bar
 * 的原生默认值，柱图观感不变，变的只是这个数现在是写明的。
 *
 * 另外记一笔：这个搭配在此之前**从来没有真正生效过**。page-transition 的 key 曾经
 * 读乐观的 location.pathname，进场与图表动画双双播在旧页面上，新页面两者都没有；
 * 那个 bug 修掉之后，上面这套换算才第一次是真的。
 *
 * ease-out 而不是 recharts 默认的 ease：入场该第一帧就最快、尾巴收住；
 * ease 首尾都缓，起步那一下会让人觉得图「愣了一下才动」。
 */
export const CHART_ANIMATION = {
	animationDuration: 400,
	animationEasing: "ease-out",
} as const;

/**
 * 图表入场动画是否放行。
 *
 * globals.css 末尾那条 prefers-reduced-motion 规则把 transition-duration /
 * animation-duration 压到 0.01ms，但 recharts 的入场动画走的是 react-smooth——
 * 用 requestAnimationFrame 逐帧改 SVG 属性，不产生任何 CSS 过渡或关键帧，
 * 那条全局规则对它完全不起作用。所以这里必须显式关掉，喂给各图的 isAnimationActive。
 *
 * 复用 page-transition.tsx 已经在用的 motion/react useReducedMotion，不另装依赖、
 * 也不自己写一份 matchMedia：两份实现迟早在 SSR 首帧的取值上分叉。
 * `!== true` 而不是 `=== false`：该 hook 在服务端与首帧返回 null，null 按「未表态」
 * 处理成放行，与 page-transition 里那句 `shouldReduceMotion === true` 取的是同一
 * 套口径（那边 null 也落到常规档）。
 *
 * 这里是**整个关掉**而不是像页面进场那样缩到 120ms：图表入场是三个环各自转半圈，
 * 属于会引起前庭不适的位移/旋转类动效，不是纯透明度的溶解，没有「换个短一点的版本」
 * 这个选项。页面进场保留 120ms 的依据见 page-transition.tsx 的
 * ENTER_TRANSITION_REDUCED。
 */
export function useChartAnimation(): boolean {
	return useReducedMotion() !== true;
}

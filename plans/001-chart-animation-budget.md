# 001 — 把概览页图表的入场时长收进交互预算

- **Status**: TODO
- **Commit**: 0c78c13
- **Severity**: HIGH
- **Category**: 2 — 缓动与时长（并入 8.3 图文时长不一致）
- **Estimated scope**: 3 个文件，约 +12 / -4 行

## Problem

`apps/web/src/components/overview/` 下的四张图都只传了 `isAnimationActive`，**没有传
`animationDuration`**，于是全部吃 recharts 的默认值：

- `node_modules/recharts/lib/polar/Pie.js:546` → `animationDuration: 1500,`
- `node_modules/recharts/lib/cartesian/Bar.js:506` → `animationDuration: 400,`

而概览页**同时渲染三个环形图**——
`apps/web/src/components/overview/overview-totals-card.tsx:99`、
`apps/web/src/components/overview/overview-ai-card.tsx:58`、
`apps/web/src/components/overview/overview-coverage-card.tsx:177` 各渲染一个
`<OverviewDonut>`，外加 `overview-priority-card.tsx:74` 的一个 `<OverviewPriorityBars>`。

当前代码：

```tsx
// apps/web/src/components/overview/overview-donut.tsx:142-151 — current
				<Pie
					data={[...data, ...track]}
					dataKey="value"
					innerRadius={INNER_RADIUS}
					isAnimationActive={animate}
					nameKey="key"
					outerRadius={OUTER_RADIUS}
					stroke={CHART_SEAM.stroke}
					strokeWidth={CHART_SEAM.strokeWidth}
				>
```

```tsx
// apps/web/src/components/overview/overview-priority-bars.tsx:92-99 — current
				<Bar
					background={{ fill: "var(--chart-1)", radius: BAR_RADIUS }}
					barSize={BAR_SIZE}
					dataKey="count"
					isAnimationActive={animate}
					radius={BAR_RADIUS}
					stroke={CHART_SEAM.stroke}
					strokeWidth={CHART_SEAM.strokeWidth}
				>
```

为什么这很糟：

1. **1500ms 是页面进场动画的五倍。** `apps/web/src/components/layout/page-transition.tsx:34`
   的 `ENTER_DURATION_S = 0.3`（300ms）。进入概览页时，`<main>` 300ms 就已经落位，
   卡片标题、计数行、徽章全部就位并可读，三个环却还要再自己转 1.2 秒。用户已经
   在读数字了，余光里还有三块东西在动——这是纯粹的注意力税，不传达任何信息。
2. **文字瞬时、图形自转，两者说的是同一份数据。** `overview-totals-card.tsx:115-123`
   的 `<dl>` 计数行和环上的扇区来自同一个 `statusCounts`。文字第一帧就是终值，环
   却要 1.5 秒才走到那个角度，同一份数据在同一张卡里给出两个互相矛盾的「已经好了」
   的时刻。
3. **默认缓动是 `'ease'`。** recharts 的 `animationEasing` 默认值是 `'ease'`
   （= `cubic-bezier(0.25, 0.1, 0.25, 1)`），首尾都缓——入场应该 `ease-out`：
   第一帧就跑得最快，尾巴慢下来收住。

## Target

把两张图的动画参数收进一处共享常量，时长 **400ms**、缓动 **`ease-out`**。

400ms 的取法：必须明显长于 `page-transition` 的 300ms 之内能被看完，又要在页面
落位后**很快**结束。400ms 意味着环在主内容落位后约 100ms 收尾，读者的视线还没
离开卡片，不会出现「读完字了图还在动」。同时 400ms 正好是 recharts `Bar` 的原生
默认值，柱图的观感不会改变——改变的只是它现在是**写明的**，而不是碰巧对了。

```ts
/* apps/web/src/components/overview/overview-chart.ts — target，新增 */
export const CHART_ANIMATION = {
	animationDuration: 400,
	animationEasing: "ease-out",
} as const;
```

```tsx
/* apps/web/src/components/overview/overview-donut.tsx — target */
				<Pie
					{...CHART_ANIMATION}
					data={[...data, ...track]}
					dataKey="value"
					innerRadius={INNER_RADIUS}
					isAnimationActive={animate}
					nameKey="key"
					outerRadius={OUTER_RADIUS}
					stroke={CHART_SEAM.stroke}
					strokeWidth={CHART_SEAM.strokeWidth}
				>
```

```tsx
/* apps/web/src/components/overview/overview-priority-bars.tsx — target */
				<Bar
					{...CHART_ANIMATION}
					background={{ fill: "var(--chart-1)", radius: BAR_RADIUS }}
					barSize={BAR_SIZE}
					dataKey="count"
					isAnimationActive={animate}
					radius={BAR_RADIUS}
					stroke={CHART_SEAM.stroke}
					strokeWidth={CHART_SEAM.strokeWidth}
				>
```

## Repo conventions to follow

- **共享图表常量放在 `apps/web/src/components/overview/overview-chart.ts`。** 该文件
  已经是这个角色：`CHART_SEAM`（`overview-chart.ts:15`）与 `useChartAnimation()`
  （`overview-chart.ts:30`）都住在这里，两张图各自 import。新常量放同一个文件，
  紧跟在 `CHART_SEAM` 之后、`useChartAnimation` 之前。
- **每个常量都要带一段说明「为什么是这个数」的中文块注释。** 照抄
  `overview-chart.ts:3-14`（`CHART_SEAM` 上方那段）的密度与语气：先说这是什么，
  再说选它而不选别的的理由，能引实测数字就引。
- **常量用 `as const`。** 见 `overview-chart.ts:15` 的 `CHART_SEAM`。这里是必需的，
  否则 `animationEasing` 会被推断成 `string`，对不上 recharts 的 `AnimationTiming`
  联合类型。
- **JSX 属性按字母序排。** Biome 的 `useSortedJsxProps` 在本仓开着——`{...CHART_ANIMATION}`
  这类展开必须放在**所有具名属性之前**（展开会被排序规则当作分隔点，放中间会让它
  后面的属性重新从头排，且语义上覆盖关系会变）。上面的 target 已经是正确顺序。
- **import 按组排序。** 两个组件文件已经从 `@/components/overview/overview-chart`
  具名导入 `CHART_SEAM, useChartAnimation`，把 `CHART_ANIMATION` 加进**同一条**
  import 的花括号里，按字母序排在 `CHART_SEAM` 前面。

## Steps

1. 编辑 `apps/web/src/components/overview/overview-chart.ts`。在 `CHART_SEAM` 的
   定义（第 15 行）之后、`useChartAnimation` 的文档注释（第 17 行）之前，插入一个
   空行，然后插入带注释的新常量：

   ```ts
   /**
    * 图表入场动画的时长与缓动。两张图共用，改这里就是同时改整页。
    *
    * recharts 的默认值对这一页是灾难：Pie 默认 1500ms（node_modules/recharts/lib/
    * polar/Pie.js:546），而概览页一次要画三个环，主内容区的进场只有 300ms
    * （page-transition.tsx 的 ENTER_DURATION_S）——文字第一帧就落位可读了，三个环
    * 还要再自转一秒多。同一份数据在同一张卡里给出两个「已经好了」的时刻。
    *
    * 400ms：环在主内容落位后约 100ms 收尾，视线还没离开这张卡；同时它正好是
    * recharts Bar 的原生默认值，柱图观感不变，变的只是这个数现在是写明的。
    *
    * ease-out 而不是 recharts 默认的 ease：入场该第一帧就最快、尾巴收住；
    * ease 首尾都缓，起步那一下会让人觉得图「愣了一下才动」。
    */
   export const CHART_ANIMATION = {
   	animationDuration: 400,
   	animationEasing: "ease-out",
   } as const;
   ```

2. 编辑 `apps/web/src/components/overview/overview-donut.tsx`：
   - 把第 9-12 行的 import 改成
     `import { CHART_ANIMATION, CHART_SEAM, useChartAnimation } from "@/components/overview/overview-chart";`
     （保持原有的多行格式，只在花括号里加一个名字）。
   - 在第 142 行的 `<Pie` 之后、`data={...}` 之前加一行 `{...CHART_ANIMATION}`。

3. 编辑 `apps/web/src/components/overview/overview-priority-bars.tsx`：
   - 把第 11-14 行的 import 同样加上 `CHART_ANIMATION`。
   - 在第 92 行的 `<Bar` 之后、`background={...}` 之前加一行 `{...CHART_ANIMATION}`。

## Boundaries

- **不要动 `isAnimationActive={animate}`。** 那是 `prefers-reduced-motion` 的开关，
  理由写在 `overview-chart.ts:17-29`：recharts 走 react-smooth 的 rAF，globals.css
  末尾那条全局规则对它无效，所以必须显式关。这条与本计划无关，保持原样。
- **不要动 `CHART_SEAM`、`OUTER_RADIUS`、`INNER_RADIUS`、`BAR_SIZE`、`BAR_RADIUS`、
  `AXIS_WIDTH`** 或任何几何/配色常量。
- **不要动四张卡片组件**（`overview-totals-card.tsx`、`overview-ai-card.tsx`、
  `overview-coverage-card.tsx`、`overview-priority-card.tsx`）。它们只是调用方，
  本计划不改它们的任何一行。
- **不要动 `packages/ui/src/components/chart.tsx`。** 那是 vendored 的 shadcn 原件
  （见 `scripts/vendored-ui.js`），改它会扩大 `shadcn add chart --diff` 的差异面。
- **不要加错峰/延迟**（`animationBegin`）。三个环同时开始是对的：它们是并列的三张
  卡，不存在需要用顺序传达的层级关系。
- **不要新增依赖。**
- 若步骤里引用的行号或代码与你看到的对不上（自 `0c78c13` 起有漂移），**停下来报告**，
  不要自行发挥。

## Verification

- **Mechanical**：
  - `pnpm check-types` — 7/7 通过。特别确认 `animationEasing: "ease-out"` 没有
    因为丢了 `as const` 而被推断成 `string`（那会报 `Type 'string' is not
    assignable to type 'AnimationTiming'`）。
  - `pnpm exec vitest run` — 24 个文件 / 279 个测试全绿。
  - `pnpm dlx ultracite check apps packages` — 只应剩已知的 3 条 `noConsole` 警告
    （`apps/server/src/index.ts` 的 :53、:66、:128）。**不要**跑 `ultracite fix`。
  - `node scripts/check-tailwind.js apps/web/src/components/overview/overview-donut.tsx apps/web/src/components/overview/overview-priority-bars.tsx apps/web/src/components/overview/overview-chart.ts` — 退出码 0（成功时会打印一行 ✅，不是错误）。
  - `node scripts/check-file-rules.js apps/web/src/components/overview/overview-chart.ts` — 退出码 0（成功时会打印一行 ✅，不是错误）。
- **Feel check**：打开 `/projects/<某个有数据的项目>/overview`，硬刷新。
  - 三个环与柱图应在主内容淡入落位后**紧接着**收尾，而不是页面静止后还在转。
    整页从空白到「一切都不动了」应在半秒出头结束。
  - 在 DevTools → Animations 面板把播放速度设为 10%，重新加载：环的角度增长应
    **一开始最快、越到终点越慢**（ease-out）。若看到起步慢、中段快、收尾慢
    （两头对称），说明 `animationEasing` 没生效，回去检查是不是被具名属性覆盖了。
  - DevTools → Rendering → `prefers-reduced-motion: reduce`，重新加载：四张图应
    **直接以终态出现，完全不动**（由 `isAnimationActive` 负责）。若还在动，
    说明改动误伤了那条开关。
- **Done when**：
  - `grep -n 'CHART_ANIMATION' apps/web/src/components/overview/*.ts*` 命中 5 处
    （1 处定义 + 2 处 import + 2 处展开）。
  - `grep -rn 'animationDuration' apps/web/src` 只命中 `overview-chart.ts` 一处。
  - 上述 5 条 Mechanical 命令全部按预期通过。

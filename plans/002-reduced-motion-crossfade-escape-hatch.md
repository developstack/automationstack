# 002 — 让纯透明度交叉淡入在「减弱动效」下活下来

- **Status**: TODO
- **Commit**: 0c78c13
- **Severity**: HIGH
- **Category**: 6 — 可访问性
- **Estimated scope**: 2 个文件，约 +30 / -3 行
- **本计划是 005 / 006 / 007 的前置**：不先做它，那三份计划新增的每一次交叉淡入
  在 `prefers-reduced-motion: reduce` 下都会被静默压成硬切。

## Problem

`packages/ui/src/styles/globals.css:231-237` 有一条全局的减弱动效规则：

```css
/* packages/ui/src/styles/globals.css:225-237 — current */
/*
 * 尊重系统「减弱动效」偏好：把过渡与动画压到近似瞬时（而不是直接 none，
 * 否则 Base UI 等 transitionend/animationend 的弹层会卡在挂载状态）。
 * 刻意放过 animate-spin / animate-pulse：它们是「仍在进行中」的唯一提示，
 * 停下来会被读成假死。
 */
@media (prefers-reduced-motion: reduce) {
	*:not(.animate-spin):not(.animate-pulse) {
		transition-duration: 0.01ms;
		animation-duration: 0.01ms;
		animation-iteration-count: 1;
	}
}
```

这条规则**过度生效**了。WCAG 2.3.3 与 `prefers-reduced-motion` 针对的是**前庭
不适**——位移、缩放、旋转、视差。**纯透明度的交叉淡入不引起前庭反应**，它是这类
用户仍然需要的那条「东西换了」的线索。把它一起压成 0.01ms，等于让减弱动效的用户
拿到比默认更差、更突兀的界面。

现在就有一个活着的受害者。`apps/web/src/components/cases/case-table-states.tsx:48-68`：

```tsx
/* apps/web/src/components/cases/case-table-states.tsx:48-68 — current */
/** 图标交叉淡入的公共类：两枚图标叠在一起，只切 opacity。 */
const SWAP_ICON = "absolute inset-0 size-5 transition-opacity ease-emphasized";

/**
 * 空态图标随「是否处于筛选」切换。仓库不引入动画库，按纯 CSS 方案做交叉淡入：
 * 两枚图标都留在 DOM 里、绝对定位叠放，避免切换时图标「啪」地跳一下。
 */
function CaseEmptyIcon({ filtered }: { filtered: boolean }) {
	return (
		<span className="relative block size-5">
			<FilterXIcon
				aria-hidden={true}
				className={cn(SWAP_ICON, filtered ? "opacity-100" : "opacity-0")}
			/>
			<ClipboardListIcon
				aria-hidden={true}
				className={cn(SWAP_ICON, filtered ? "opacity-0" : "opacity-100")}
			/>
		</span>
	);
}
```

那段注释说这么写是为了「避免切换时图标『啪』地跳一下」。**在减弱动效下，用户看到
的正好就是那一下**——全局规则把 `transition-duration` 压到 0.01ms，两枚图标的
opacity 瞬间互换。为这个效果精心搭的双图标叠放结构，对这批用户毫无作用。

**为什么不能靠提高特异性绕过去。** `@utility` 生成的类落在 Tailwind 的
`@layer utilities` 里，而上面这条 `@media` 块写在 `globals.css` 末尾、**不在任何
`@layer` 内**。无层样式的优先级高于一切有层样式，与特异性无关。也就是说，任何写在
`@utility` 里的 `transition-duration` 都赢不了它——哪怕特异性做到 (0,9,0)。

## Target

把那条全局规则的写死值换成一个**带兜底的自定义属性**，让需要活下来的元素可以
自报时长。自定义属性的取值发生在元素自身，不参与层叠竞争，因此不受层级限制。

```css
/* packages/ui/src/styles/globals.css — target，替换 225-237 行整段 */
/*
 * 尊重系统「减弱动效」偏好：把过渡与动画压到近似瞬时（而不是直接 none，
 * 否则 Base UI 等 transitionend/animationend 的弹层会卡在挂载状态）。
 * 刻意放过 animate-spin / animate-pulse：它们是「仍在进行中」的唯一提示，
 * 停下来会被读成假死。
 *
 * 时长走 var(--motion-reduced-duration, 0.01ms) 而不是写死 0.01ms：
 * 这条偏好针对的是前庭不适——位移、缩放、旋转、视差。纯透明度的交叉淡入不引起
 * 前庭反应，它恰恰是这批用户仍然需要的那条「东西换了」的线索，压成硬切等于给他们
 * 一个比默认更突兀的界面。于是留一个自报时长的口子：想活下来的元素在自己身上写
 * --motion-reduced-duration，没写的一律照旧压到 0.01ms。
 *
 * 为什么必须走自定义属性而不是让工具类自己写 transition-duration 去盖：@utility
 * 生成的类落在 @layer utilities 里，而这条 @media 块不在任何 @layer 内，无层样式
 * 的优先级高于一切有层样式，跟特异性无关——工具类无论写到多特异都盖不住它。
 * 自定义属性的取值发生在元素自身，不参与这场层叠竞争，所以能穿过去。
 */
@media (prefers-reduced-motion: reduce) {
	*:not(.animate-spin):not(.animate-pulse) {
		transition-duration: var(--motion-reduced-duration, 0.01ms);
		animation-duration: var(--motion-reduced-duration, 0.01ms);
		animation-iteration-count: 1;
	}
}
```

再加一个具名工具类，把「纯透明度交叉淡入」这件事收成一个名字：

```css
/* packages/ui/src/styles/globals.css — target，新增，紧跟 transition-control 之后 */
/* 纯透明度的交叉淡入：两块内容叠放，只切 opacity，绝不带位移或缩放
   （等价于 transition-[opacity] + duration-150 + ease-[cubic-bezier(0.2,0,0,1)]）。
   曲线取 better-ui 为图标/内容交叉淡入规定的 cubic-bezier(0.2, 0, 0, 1)：
   起步的斜率是 0（第一控制点 x=0.2、y=0），因此不会一上来就闪，尾段拉长收住。

   --motion-reduced-duration: 120ms 是这个类存在的主要理由。文件末尾那条全局的
   prefers-reduced-motion 规则会把一切过渡压到 0.01ms，而交叉淡入是纯透明度、不引起
   前庭不适，被压掉之后这批用户看到的正是这套结构本来要消除的那一下硬切。120ms 与
   page-transition.tsx 的 REDUCED_DURATION_S（0.12s）取同一个值：全站在减弱动效下
   只保留这一档「几乎察觉不到、但不是硬切」的透明度变化。

   & > * 把变量在子元素上重置为 initial（自定义属性的 initial 是「保证无效值」，
   于是 var() 回落到 0.01ms 的兜底）：这个变量会继承，不重置的话挂着本类的容器会
   顺手把自己的子孙后代全部从减弱动效里放出来，那不是本类的职责范围。 */
@utility transition-crossfade {
	--motion-reduced-duration: 120ms;
	transition-timing-function: cubic-bezier(0.2, 0, 0, 1);
	transition-duration: 150ms;
	transition-property: opacity;

	& > * {
		--motion-reduced-duration: initial;
	}
}
```

然后把现存的那个受害者迁过去：

```tsx
/* apps/web/src/components/cases/case-table-states.tsx:48-49 — target */
/** 图标交叉淡入的公共类：两枚图标叠在一起，只切 opacity。
    transition-crossfade 同时负责在「减弱动效」下保住这段淡入——那正是本结构
    要消除的那一下硬切，见 globals.css 里该工具类上方的注释。 */
const SWAP_ICON = "absolute inset-0 size-5 transition-crossfade";
```

## Repo conventions to follow

- **具名工具类定义在 `packages/ui/src/styles/globals.css`**，本仓禁止 Tailwind 任意值
  （`scripts/check-tailwind.js` 会拦 `apps/web`），所以每一个非刻度值都必须先变成
  一个 `@utility`。
- **每个 `@utility` 上方都有一段中文块注释**，写明它是什么、等价的任意值写法是什么、
  以及为什么这么选。**必须照做**，密度参照 `globals.css:28-30`（`transition-control`）
  与 `globals.css:157-161`（`transition-sidebar-gap`）。
- **只列真正会变的属性，绝不写 `transition: all`。** 见 `globals.css:31-36`
  的 `transition-control` —— 它逐条列出 `color, background-color, border-color,
  box-shadow, opacity, scale`。本类只需要 `opacity`。
- **新 `@utility` 的位置**：紧跟在 `transition-control`（`globals.css:31-36`）
  的右花括号之后，空一行再写。两者是同一族（交互过渡），排在一起。
  **不要**排到 `tooltip-arrow` / `popup-transition` 之后——`globals.css:52` 的注释
  说明了这两者之间存在 `noDescendingSpecificity` 的顺序约束，不要卷进去。
- **减弱动效的时长基准是 120ms**，来自 `apps/web/src/components/layout/page-transition.tsx:36`
  的 `const REDUCED_DURATION_S = 0.12;`。这是全站唯一的那一档，不要另取一个数。

## Steps

1. 编辑 `packages/ui/src/styles/globals.css`。在第 36 行（`transition-control` 的
   右花括号 `}`）之后插入一个空行，然后插入 Target 段里那整块
   `/* 纯透明度的交叉淡入… */` 注释加 `@utility transition-crossfade { … }`。

2. 同一个文件，把第 225-237 行的整段（注释 + `@media` 块）替换成 Target 段里
   给出的新版本。两处 `0.01ms` 改成 `var(--motion-reduced-duration, 0.01ms)`；
   `animation-iteration-count: 1;` 保持不变；注释按 Target 里的全文替换。

3. 编辑 `apps/web/src/components/cases/case-table-states.tsx`，把第 48-49 行
   替换成 Target 段里的三行注释加新的 `SWAP_ICON` 常量。
   `SWAP_ICON` 的值从
   `"absolute inset-0 size-5 transition-opacity ease-emphasized"`
   改成
   `"absolute inset-0 size-5 transition-crossfade"`。

4. 确认 `case-table-states.tsx` 里 `CaseEmptyIcon`（第 55-68 行）的其余部分**一个
   字都没动**：两枚图标仍然都留在 DOM 里、仍然绝对定位叠放、仍然只切
   `opacity-100` / `opacity-0`。

## Boundaries

- **不要动 `ease-emphasized`**（`apps/web/src/index.css:27-29`）。它在
  `app-sidebar.tsx:61` 与 `:65` 还有两处调用，本计划不碰那个文件。
  （它的注释里「起步快」一句与实际曲线不符，已单独记在 `plans/README.md` 的
  待办里，**不在本计划范围内**。）
- **不要动 `animate-spin` / `animate-pulse` 那两个 `:not()` 例外**，也不要往
  `:not()` 链上再加名字。本计划的整个要点就是不再靠那条链扩容。
- **不要给任何别的元素加 `transition-crossfade`。** 本计划只迁移 `SWAP_ICON`
  一处。005 / 006 / 007 会各自加各自的。
- **不要动 `globals.css` 里其它任何 `@utility`**，包括那些零调用的
  （`press-scale`、`tooltip-arrow`、`popup-transition`、`transition-focus-ring`、
  `bg-muted-hover`、`bg-bubble-tinted*`）。清理它们是另一件事。
- **不要新增依赖。**
- 若步骤里引用的行号或代码与你看到的对不上，**停下来报告**。

## Verification

- **Mechanical**：
  - `pnpm check-types` — 7/7 通过。
  - `pnpm exec vitest run` — 24 个文件 / 279 个测试全绿。
  - `pnpm dlx ultracite check apps packages` — 只应剩已知的 3 条 `noConsole` 警告。
    **不要**跑 `ultracite fix`。
  - `node scripts/check-tailwind.js apps/web/src/components/cases/case-table-states.tsx` — 退出码 0（成功时会打印一行 ✅，不是错误）。
  - `grep -c 'transition-opacity ease-emphasized' apps/web/src/components/cases/case-table-states.tsx`
    应为 `0`。
- **Feel check**：进入某个项目的用例列表，选一个**没有用例的模块**（会渲染空态），
  然后在筛选栏里随便填一个关键词再清掉，让空态在「还没有用例」与「没有匹配的用例」
  之间来回切。
  - **默认状态**：图标应在 150ms 内交叉淡入，中途没有任何一帧是两枚图标都看不见的
    空白。DevTools → Animations 面板设 10% 播放速度，应看到一枚淡出的同时另一枚
    淡入，两条曲线**首帧慢、随后加速、尾段收住**。
  - **减弱动效**：DevTools → Rendering → 勾上 `prefers-reduced-motion: reduce`，
    重复同一次切换。图标**仍应交叉淡入**，只是更快（120ms）。**这是本计划的核心
    验收点**——改动前它是硬切。
  - 同一次减弱动效开着的状态下，随便打开一个下拉菜单或对话框：它们应**仍然是瞬时
    出现**（没有自报 `--motion-reduced-duration`，照旧被压到 0.01ms）。若它们也开始
    有过渡了，说明变量被写到了 `:root` 或某个祖先上，泄漏了。
  - 检查继承没有泄漏：在 Elements 面板里选中带 `transition-crossfade` 的那枚
    `<svg>`，Computed 面板搜 `--motion-reduced-duration`，应为 `120ms`；
    选中它的任意子节点（`<path>`），同一个变量应显示为无效/空。
- **Done when**：
  - `grep -n 'motion-reduced-duration' packages/ui/src/styles/globals.css` 命中 4 处
    （工具类里 1 处赋值 + 子元素重置 1 处 + `@media` 块里 2 处 `var()`）。
  - `grep -rn 'transition-crossfade' apps packages --include=*.tsx --include=*.css`
    命中 2 处（`globals.css` 的定义 + `case-table-states.tsx` 的使用）。
  - 上述 Mechanical 命令全部按预期通过，且减弱动效下的 Feel check 第二条成立。

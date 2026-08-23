# 003 — 浮层改用可打断的 popup-transition，并把对话框时长补进预算

- **Status**: TODO
- **Commit**: 0c78c13
- **Severity**: HIGH
- **Category**: 4 — 可打断性（并入 2 缓动与时长、7 凝聚力）
- **Estimated scope**: 7 个文件，净删除约 40 处类名，新增 6 处

## Problem

### 1. 仓库写好了一套可打断的浮层过渡，然后一次都没用

`packages/ui/src/styles/globals.css:78-111` 定义了 `popup-transition`，注释里
完整论证了为什么必须用 transition 而不是 keyframes：

```css
/* packages/ui/src/styles/globals.css:78-111 — current */
/* 浮层进出场。用 transition 而不是 keyframes：keyframes 不可打断，退场播到一半再打开
   会跳回位移起点重播，而模块树每一行都挂着这类浮层。Base UI 用 data-starting-style /
   data-ending-style 标出首帧与退场帧，浏览器在两端之间插值，中途反向也能从当前值接上。
   只列这三个属性，避免 duration-* 单独出现时被解释成 transition-property: all
   （等价于 transition-[opacity,scale,translate] 加一组 data-[side=*] 的位移任意值）。 */
@utility popup-transition {
	transition-timing-function: ease-out;
	transition-duration: 150ms;
	transition-property: opacity, scale, translate;

	/* Base UI 在「瞬时打开」（键盘连续操作、焦点转移）时打上 data-instant，
	   这种时候还播过渡只会留下拖影。 */
	&[data-instant] {
		transition-duration: 0s;
	}

	&:is([data-starting-style], [data-ending-style]) {
		opacity: 0;
		scale: 0.95;

		&[data-side="top"] { translate: 0 0.5rem; }
		&[data-side="bottom"] { translate: 0 -0.5rem; }
		&:is([data-side="left"], [data-side="inline-start"]) { translate: 0.5rem 0; }
		&:is([data-side="right"], [data-side="inline-end"]) { translate: -0.5rem 0; }
	}
}
```

`grep -rn 'popup-transition' apps packages --include=*.tsx` 返回 **0 处**。
（只有 `page-transition.tsx:12` 的一句注释提到它的名字。）

六个浮层现在跑的全是 tw-animate-css 的关键帧，`data-instant` 无人消费：

| 文件 | 行 | 组件 |
| --- | --- | --- |
| `packages/ui/src/components/context-menu.tsx` | 58 | `ContextMenuContent` |
| `packages/ui/src/components/dropdown-menu.tsx` | 41 | `DropdownMenuContent` |
| `packages/ui/src/components/dropdown-menu.tsx` | 140 | `DropdownMenuSubContent` |
| `packages/ui/src/components/tooltip.tsx` | 51 | `TooltipContent` |
| `packages/ui/src/components/select.tsx` | 90 | `SelectContent` |
| `packages/ui/src/components/popover.tsx` | 36 | `PopoverContent` |

**关键帧不可打断。** 右键菜单挂在模块树的**每一行**上（`ContextMenuContent` 在
`apps/web/src` 里只有 1 处声明，但它挂的是整棵模块树的行）；用户在树上连续右键
换行时，上一个菜单的退场关键帧还没播完，新菜单已经从位移起点重新播一遍——看到的
是「跳回去、再重来」。`popup-transition` 的注释一字不差地说的就是这件事。

**机制上完全可行，已核实**：Base UI 1.7.0 的 menu / popover / tooltip / select
四族 DataAttributes 文件里 `data-starting-style` 与 `data-ending-style` **全部存在**
（`node_modules/@base-ui/react/internals/stateAttributesMapping.js:11,15`）。
不缺任何 hook，换过去即可。

### 2. 两个已经失效的 Radix 时代选择器

**`packages/ui/src/components/select.tsx:90`** 带着 `data-[align-trigger=true]:animate-none`。
`align-trigger` 在 `@base-ui/react@1.7.0` 全包里是 **0 命中**。Base UI 实际写的是
`data-side="none"`（`node_modules/@base-ui/react/select/positioner/SelectPositioner.js:107`：
`const renderedSide = alignItemWithTriggerActive ? 'none' : positioning.side;`），
而 `alignItemWithTrigger = true` 是**默认值**（同文件 :55）。也就是说这条抑制
**从来没有生效过**，六条 `data-[side=*]:slide-in-from-*` 全部照播。

**`packages/ui/src/components/tooltip.tsx:51`** 带着三个
`data-[state=delayed-open]:*`。Base UI 的 tooltip 不发 `data-state`，这三个类是死的。

### 3. 六个浮层的 `duration-100` 与两个对话框的 `duration-100`

六个浮层都写着 `duration-100`。tw-animate-css 的 `--animate-in` 默认取
`var(--tw-duration, .15s)`，`duration-100` 把它压到 100ms，且缓动是内建的
`ease`（首尾都缓），不是入场该用的 `ease-out`。

`packages/ui/src/components/dialog.tsx:30`、`:52` 与
`packages/ui/src/components/alert-dialog.tsx:31`、`:52` 同样是 `duration-100`。
对话框是**遮挡全屏、要求用户停下来处理**的一层，100ms 快到读不出「有东西盖上来了」。

## Target

### 六个浮层：删掉整套关键帧类，换成一个 `popup-transition`

每处的改法一致——把下列类**全部删除**：

- 六条 `data-[side=*]:slide-in-from-*`
- `data-open:fade-in-0`、`data-open:zoom-in-95`
- `data-closed:fade-out-0`、`data-closed:zoom-out-95`
- `data-closed:animate-out`、`data-open:animate-in`
- `duration-100`
- （仅 tooltip）`data-[state=delayed-open]:fade-in-0`、`data-[state=delayed-open]:zoom-in-95`、`data-[state=delayed-open]:animate-in`
- （仅 select）`data-[align-trigger=true]:animate-none`

然后在类名串**最前面**加上 `popup-transition`。其余每一个类**原样保留**，包括
`origin-(--transform-origin)`（`popup-transition` 的 `scale` 同样受
`transform-origin` 支配，这条正是把缩放锚在触发器上的那一条）与
`data-closed:overflow-hidden`。

六处的最终字符串：

```tsx
/* packages/ui/src/components/context-menu.tsx:58 — target */
						"popup-transition z-50 max-h-(--available-height) min-w-36 origin-(--transform-origin) overflow-y-auto overflow-x-hidden rounded-md bg-popover p-1 text-popover-foreground shadow-md outline-none ring-1 ring-foreground/10 data-closed:overflow-hidden",
```

```tsx
/* packages/ui/src/components/dropdown-menu.tsx:41 — target */
						"popup-transition z-50 max-h-(--available-height) w-(--anchor-width) min-w-32 origin-(--transform-origin) overflow-y-auto overflow-x-hidden rounded-md bg-popover p-1 text-popover-foreground shadow-md outline-none ring-1 ring-foreground/10 data-closed:overflow-hidden",
```

```tsx
/* packages/ui/src/components/dropdown-menu.tsx:140 — target */
				"popup-transition w-auto min-w-[96px] rounded-md bg-popover p-1 text-popover-foreground shadow-lg ring-1 ring-foreground/10",
```

```tsx
/* packages/ui/src/components/tooltip.tsx:51 — target */
						"popup-transition z-50 inline-flex w-fit max-w-xs origin-(--transform-origin) items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-background text-xs has-data-[slot=kbd]:pr-1.5 **:data-[slot=kbd]:relative **:data-[slot=kbd]:isolate **:data-[slot=kbd]:z-50 **:data-[slot=kbd]:rounded-sm",
```

```tsx
/* packages/ui/src/components/select.tsx:90 — target */
						"popup-transition relative isolate z-50 max-h-(--available-height) w-(--anchor-width) min-w-36 origin-(--transform-origin) overflow-y-auto overflow-x-hidden rounded-md bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10",
```

```tsx
/* packages/ui/src/components/popover.tsx:36 — target */
						"popup-transition z-50 flex w-72 origin-(--transform-origin) flex-col gap-4 rounded-md bg-popover p-4 text-popover-foreground text-sm shadow-md outline-hidden ring-1 ring-foreground/10",
```

**关于 select 那条死选择器**：删掉 `data-[align-trigger=true]:animate-none` 之后
**不需要**补任何替代。`popup-transition` 的四条位移分支全部挂在具体的
`data-side` 值（`top` / `bottom` / `left` / `right` / `inline-*`）上，而
`alignItemWithTrigger` 生效时 Base UI 给的是 `data-side="none"`——一条都匹配不上，
于是自动退化成「只有 opacity + scale、没有位移」。那条死选择器本来想要的效果，
换过去之后无需任何代码就成立了。

### 两个对话框：`duration-100` → `duration-200`

只改这一个 token，四处：`dialog.tsx:30`、`dialog.tsx:52`、
`alert-dialog.tsx:31`、`alert-dialog.tsx:52`。其余一律不动。

200ms 的取法：对话框是遮挡全屏的一层，需要被看到「盖上来了」；同时它是低频操作，
可以比浮层的 150ms 慢一档。200ms 是这两个约束的交点，也与
`packages/ui/src/components/sheet.tsx:51` 已在用的 `duration-200` 对齐——抽屉与
对话框同属「模态层」，应该走同一个时钟。

**对话框刻意不换机制。** 它们不是高频重复触发的东西（打开一个对话框之后用户会
停下来读），关键帧不可打断在这里不构成问题；而且它们居中定位、根本没有
`data-side`，`popup-transition` 的四条位移分支对它们全部落空。换过去只会得到
一份更长的 diff 和零收益。

## Repo conventions to follow

- **`packages/ui/src/components/` 是 vendored 的 shadcn 原件**（见
  `scripts/vendored-ui.js`），判定标准是「与 registry 一致」。本计划**刻意**偏离
  registry，因此每一处改动都**必须**在该文件顶部的文件级注释里登记，格式照抄
  `packages/ui/src/components/chart.tsx:3-13` 那段——先说「与官方原件的唯一一处
  改动是什么」，再说理由。见下面 Steps 第 8 步。
- **该目录豁免 `check-tailwind.js` 的任意值禁令**，所以 `min-w-[96px]`、
  `**:data-[slot=kbd]:*` 这类保持原样，不要顺手改。
- **类名串里 `cn()` 的第一个参数是基础串、第二个是 `className`**，不要调换。
- **`popup-transition` 已经存在**，不需要新建任何 `@utility`。

## Steps

1. `packages/ui/src/components/context-menu.tsx`：把第 58 行整行替换成 Target 里
   对应的字符串。缩进保持 6 个制表符（与原行一致）。
2. `packages/ui/src/components/dropdown-menu.tsx`：把第 41 行替换成 Target 里
   对应的字符串。
3. 同一个文件，把第 140 行替换成 Target 里对应的字符串（缩进 4 个制表符）。
4. `packages/ui/src/components/tooltip.tsx`：把第 51 行替换成 Target 里对应的字符串。
5. `packages/ui/src/components/select.tsx`：把第 90 行替换成 Target 里对应的字符串。
6. `packages/ui/src/components/popover.tsx`：把第 36 行替换成 Target 里对应的字符串。
7. 四处 `duration-100` → `duration-200`，**逐处手工确认行号**后再改：
   `dialog.tsx:30`、`dialog.tsx:52`、`alert-dialog.tsx:31`、`alert-dialog.tsx:52`。
   改完后 `grep -rn 'duration-100' packages/ui/src/components/` 应返回空。
8. 给六个换了机制的文件各加一段文件级注释（若该文件已有顶部块注释，就在其中**追加**
   一段，不要新起一块）。文案模板：

   ```
   /* 与 shadcn 原件的一处刻意偏离：浮层的进出场由 tw-animate-css 关键帧
      （data-open:animate-in / data-closed:animate-out 那一整套）换成了
      packages/ui/src/styles/globals.css 里的 popup-transition 工具类。
      理由见该工具类上方的注释：关键帧不可打断，退场播到一半再打开会跳回位移起点
      重播，而本仓的模块树每一行都挂着这类浮层。换过去同时消费了 Base UI 的
      data-instant（键盘连续操作时不留拖影），并让时长与缓动落在一处可改的地方。
      shadcn add <name> --diff 会因此报出这一行的差异，属预期。 */
   ```

   `select.tsx` 的那一段后面**再追加一句**：
   ```
      同时删掉了 data-[align-trigger=true]:animate-none：align-trigger 在
      @base-ui/react@1.7.0 里 0 命中，Base UI 实际发的是 data-side="none"
      （select/positioner/SelectPositioner.js:107），这条抑制从未生效过。
      popup-transition 的位移分支全部挂在具体 data-side 值上，"none" 一条都匹配
      不上，自动退化成只有 opacity + scale，正是那条死选择器本来想要的效果。
   ```

   `tooltip.tsx` 的那一段后面**再追加一句**：
   ```
      同时删掉了三个 data-[state=delayed-open]:*：Base UI 的 tooltip 不发
      data-state，那是 Radix 时代留下的死类。
   ```

## Boundaries

- **不要动 `popup-transition` 本身**（`globals.css:78-111`）。它的 150ms、`ease-out`、
  0.5rem 位移、`data-instant` 分支全部保持原样。它的注释已经论证过这些选择，
  不要重新讨论（Hard Rule 5）。
- **不要动 `sheet.tsx`。** 它已经是 transition 驱动的了。它的 `ease-in-out` 与
  遮罩/面板 150 vs 200ms 不同步是另一条独立发现，**不在本计划范围内**。
- **不要动 `dialog.tsx` / `alert-dialog.tsx` 的机制**，只改那四个 `duration-100`。
  不要给它们加 `popup-transition`。
- **不要动 `tooltip.tsx:7` 的 `delay = 0`**，也不要动 `tooltip.tsx:58` 的箭头类名串。
  两者都是独立发现。
- **不要动六个文件里的任何其它行**——菜单项、分隔线、标签、trigger 的类名一律不碰。
- **不要跑 `pnpm dlx ultracite fix`**（它会全仓改写）。若 `ultracite check` 只报
  `useSortedClasses`（类名顺序）且报在你改的这六行上，**手工**按它给的顺序调整那
  一行，不要跑 fix。
- **不要新增依赖。**
- 若步骤里引用的行号或代码与你看到的对不上，**停下来报告**。

## Verification

- **Mechanical**：
  - `pnpm check-types` — 7/7 通过。
  - `pnpm exec vitest run` — 24 个文件 / 279 个测试全绿。
  - `pnpm dlx ultracite check apps packages` — 只应剩已知的 3 条 `noConsole` 警告。
  - `grep -rn 'animate-in\|animate-out\|slide-in-from\|zoom-in-95\|zoom-out-95\|fade-in-0\|fade-out-0' packages/ui/src/components/context-menu.tsx packages/ui/src/components/dropdown-menu.tsx packages/ui/src/components/tooltip.tsx packages/ui/src/components/select.tsx packages/ui/src/components/popover.tsx`
    → **空**。
  - `grep -rn 'duration-100' packages/ui/src/components/` → **空**。
  - `grep -rn 'align-trigger\|delayed-open' packages/ui/src/` → **空**。
  - `grep -rlc 'popup-transition' packages/ui/src/components/` → 命中 6 个文件。
- **Feel check**：
  1. **可打断性（本计划的核心）**：进入某个项目，在左侧模块树上**连续快速右键**
     不同的行（每次间隔约 100ms）。菜单应**从当前位置接着走**，不应出现「先跳回
     偏移起点、再重新滑出」。改动前这一下是能看见的。
     同样的测试用顶栏的下拉菜单做一遍：连点触发器开→关→开，菜单不应重播。
  2. **锚点**：打开任意下拉菜单，用 Animations 面板 10% 播放。菜单应**从触发器
     那一侧**缩放展开（`origin-(--transform-origin)` 起作用），不是从自己的几何
     中心。若从中心涨开，说明 `origin-(--transform-origin)` 被误删了。
  3. **方向**：分别让菜单在触发器上方与下方打开（把触发器移到视口底部即可翻转），
     位移方向应始终是「从触发器那一侧浮出来」。
  4. **select 的对齐模式**：打开任意 `<Select>`（如筛选栏的优先级/状态）。它应
     **只做 opacity + scale、没有任何位移**（Base UI 默认 `alignItemWithTrigger`，
     `data-side="none"`）。在 Elements 面板确认 popup 元素上确实是 `data-side="none"`。
  5. **`data-instant`**：用键盘打开一个下拉菜单，然后用方向键/Tab 让焦点在菜单间
     快速转移。Base UI 打上 `data-instant` 的那些帧应**完全没有过渡**（不留拖影）。
     在 Elements 面板确认该属性出现过。
  6. **对话框**：打开任意对话框与确认框。200ms 应能被看成「盖上来了」，而不是
     100ms 那种一闪就位。10% 播放下确认遮罩与面板**同时**开始、同时结束。
  7. **减弱动效**：DevTools → Rendering → `prefers-reduced-motion: reduce`。
     六个浮层与两个对话框都应**瞬时出现**，且**关闭后必须真正从 DOM 消失**——
     这是最关键的回归点：`popup-transition` 依赖 `transitionend` 让 Base UI 卸载，
     若哪个浮层关闭后卡在屏幕上或留下一个吃点击的空壳，立即停下来报告。
  8. 同样在减弱动效开着的状态下，把上面第 1 条的连续右键再做一遍，确认没有菜单
     残留、没有滚动条闪烁。
- **Done when**：
  - 上述 7 条 grep 全部返回预期结果。
  - Feel check 第 1、4、7 条成立（可打断、select 无位移、减弱动效下能正常卸载）。
  - 六个文件顶部都能 grep 到新增的偏离说明：
    `grep -l 'shadcn add' packages/ui/src/components/{context-menu,dropdown-menu,tooltip,select,popover}.tsx` 命中 5 个文件。

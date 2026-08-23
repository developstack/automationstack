# 008 — 一级侧栏收窄，展开态给一颗显式的收起按钮

> Commit at authoring time: a33a38e

## Problem

两件事，同一块地方：

**1）一级侧栏太宽。** `packages/ui/src/components/sidebar-context.tsx:16` 是
`export const SIDEBAR_WIDTH = "16rem";`（256px），它上面那行注释写的是
「与旧工作区左栏同宽，模块树搬进来不会换行」。**这个前提今天已经不成立**：
模块树早就搬进了二级面板（`apps/web/src/components/layout/module-panel.tsx`
+ `apps/web/src/components/workspace/module-tree.tsx`），一级侧栏如今只剩
品牌行 + 至多三个导航项 + 底部用户区，最长的一段文字是品牌名「测试用例平台」
（6 个汉字，`text-sm` = 14px，约 84px）。256px 里有 60px 以上是纯粹的空。

**2）展开态没有可见的收起入口。** `apps/web/src/components/layout/app-sidebar.tsx:41-72`
的 `SidebarBrandButton` 把**整个品牌行**做成了开关，静止时显示烧瓶 logo，
**只有悬停时**才原地淡入 `PanelLeftCloseIcon`。用户看不到任何「这里可以收起」
的提示——必须先把鼠标碰上去才知道。用户的原话：「展开的时候 logo 旁边应该有
收起的按钮**提醒用户**可以收起侧边栏」。

## Target

### 宽度

`packages/ui/src/components/sidebar-context.tsx:16` 改成：

```ts
export const SIDEBAR_WIDTH = "13rem";
```

**13rem = 208px 是算出来的，不是拍的**，下限推导（全部按 border-box）：

- `SidebarHeader` 是 `p-2` → 左右各 8px，内宽 = W − 16
- 品牌行内部：`px-2`（8 + 8）+ 图标 16px + `gap-2` 8px + 品牌名 84px = 124px
- 右侧收起按钮 `size-8` = 32px，与品牌行之间 `gap-1` = 4px
- 最小内宽 = 124 + 4 + 32 = 160px → 最小 W = 176px = 11rem

13rem 在这个下限之上还剩 32px 余量，够品牌名将来长一两个字。**不要小于
12rem**（余量只剩 16px，品牌名会开始 truncate）。

同一行上方的注释必须整段重写——现在那句「模块树搬进来不会换行」是假话。
新注释要写清：模块树已在二级面板，这一栏只承载品牌 + 三个一级入口 + 用户区，
13rem 的下限由品牌行（124px）+ 收起按钮（32px）+ header 的 p-2（16px）推出。

`--sidebar-width-negative`（同文件 :38）由 `SIDEBAR_WIDTH` 计算得来，自动跟随，
**不要另外改**。`SIDEBAR_WIDTH_MOBILE`（18rem，窄屏抽屉）与
`SIDEBAR_WIDTH_ICON`（3rem，图标轨）**都不动**。

### 展开态的显式收起按钮

改 `apps/web/src/components/layout/app-sidebar.tsx` 的 `SidebarBrandButton`
与 `SidebarBrand`。两种形态：

**展开态（宽屏，`state === "expanded"`）**
品牌行拆成两个并排的东西：

- 左边：**不可交互**的品牌标识 —— 一个 `div`，里面是 `FlaskConicalIcon`
  （`size-4`，`aria-hidden="true"`）+ `<span className="truncate font-medium text-sm">测试用例平台</span>`，
  `flex items-center gap-2 px-2`，外层 `flex-1 min-w-0`（`min-w-0` 不能省，
  否则 `truncate` 在 flex 子项里不生效）。
  它不再有 hover 底色、不再换图标、不再是按钮。
- 右边：**始终可见**的收起按钮，用现成的
  `SidebarTrigger`（`packages/ui/src/components/sidebar.tsx:132`）：

  ```tsx
  <SidebarTrigger className="size-8 shrink-0" size="icon-sm" />
  ```

  `SidebarTrigger` 内部写的是 `size="icon"` 然后才 `{...props}`，所以调用方传的
  `size` 会覆盖它——`size="icon-sm"`（32px）与侧栏 32px 的行高节奏一致，
  `size="icon"`（36px）会比每一行导航都高，显得突兀。

**收起态（图标轨，3rem）**
轨里只有 32px 宽，塞不下第二个可点目标。此时品牌格**本身**继续当开关，
保留现在的做法：`SidebarMenuButton` + 悬停把 logo 换成 `PanelLeftOpenIcon`
+ `tooltip={BRAND_NAME}` + `aria-label="展开侧边栏"`。

**两种形态怎么切换：用 CSS 显隐，不要条件渲染。**
`SidebarPanel`（`packages/ui/src/components/sidebar.tsx:96`）在收起时才把
`data-collapsible` 设成 `"icon"`，展开时是空串，所以
`group-data-[collapsible=icon]:*` 这一族变体**天然只在收起态命中**。因此：

- 展开态那一行（品牌 div + SidebarTrigger 的容器）加 `group-data-[collapsible=icon]:hidden`
- 收起态那颗 `SidebarMenuButton` 加 `hidden group-data-[collapsible=icon]:flex`

条件渲染会在收起动画播到一半时把节点整个换掉，看起来是「闪一下」；
`--sidebar-width` 的补间由 `transition-sidebar-offset` / `transition-sidebar-gap`
负责，中途不能有 remount。

**窄屏抽屉（`isCompact`）**：`Sidebar` 走 `SidebarDrawer` 分支，外层没有
`data-collapsible`，所以 `group-data-[collapsible=icon]:hidden` 不命中，
抽屉里显示的是展开态那一行——里面那颗 `SidebarTrigger` 会调
`toggleSidebar()`，`isCompact` 为真时它切的是 `openMobile`，也就是关掉抽屉。
这是对的行为（抽屉里本来就该有个关闭入口，现在 `SheetContent` 是
`showCloseButton={false}`），不要为它加特例。

### 顺带必须改的注释

`apps/web/src/components/layout/app-shell.tsx:68-72` 那段注释说「宽屏的开关
已经在侧栏的**品牌行**和右缘细条上」——品牌行在展开态已经不是开关了。
把「品牌行」改成「品牌行右侧的收起按钮」。**只改这段文字，别动
`<SidebarTrigger className="lg:hidden" />` 那行代码。**

## Repo conventions to follow

- 组件一律用 `packages/ui/src/components/` 里现成的（用户硬规则：
  「不到不得已，不允许自己写组件」）。这里要用的是既有的 `SidebarTrigger`，
  **不要新写一个按钮组件**。
- 注释写中文，讲「为什么」不讲「是什么」，风格照抄本文件既有的注释密度。
- `apps/web` **禁止 Tailwind 任意值**（方括号字面量），由
  `scripts/check-tailwind.js` 强制；变体位置的方括号（如
  `group-data-[collapsible=icon]:hidden`）是允许的。
- 单文件 300 行上限，由 `scripts/check-file-rules.js` 强制。
- eslint：单个函数 ≤ 50 行（跳过空行与注释）、圈复杂度 ≤ 10。

## Steps

1. 改 `packages/ui/src/components/sidebar-context.tsx:16` 的值与它上方的注释。
2. 改 `apps/web/src/components/layout/app-sidebar.tsx`：拆出展开态品牌行与
   收起态开关两块，按上面的 CSS 显隐方案组合进 `SidebarBrand`。
   `SidebarBrandButton` 的那段 JSDoc（:33-40）整段重写——它现在描述的是
   「品牌行本身就是收起开关」，只在收起态还成立。
3. 改 `apps/web/src/components/layout/app-shell.tsx:68-72` 的注释措辞。
4. 若 `PanelLeftCloseIcon` 在改完后不再被引用，从 `lucide-react` 的 import 里删掉
   （eslint 的 unused import 会拦）。`PanelLeftOpenIcon` 收起态仍在用，保留。

## Boundaries

- **不要动** `packages/ui/src/components/sidebar.tsx` 与 `sidebar-menu.tsx`
  的任何代码。选中态高亮由另一个 plan（009）负责，它正在改 `sidebar-menu.tsx`，
  两边同时写会冲突。
- **不要动** `SidebarRail`（右缘细条）与 `⌘B` 快捷键。
- **不要动** `SIDEBAR_WIDTH_MOBILE`、`SIDEBAR_WIDTH_ICON`、
  `--sidebar-width-negative`。
- **不要动** `packages/ui/src/styles/theme.css`（009 在改）。
- 不做任何 git 写操作（commit / push / add / checkout / stash / restore / branch）。
- 不要顺手清理无关的东西。发现了就在报告里说，别自己改。

## Verification

```bash
pnpm eslint --no-cache apps/web/src/components/layout/app-sidebar.tsx \
  apps/web/src/components/layout/app-shell.tsx \
  packages/ui/src/components/sidebar-context.tsx
node scripts/check-tailwind.js <改过的文件>
node scripts/check-file-rules.js <改过的文件>
```

三条都必须 exit 0。**注意 `check-*.js` 不带参数时是静默 no-op**（打印
「没有文件需要检查」并 exit 0），一定要把文件路径传进去。

不要跑 `pnpm check-types` / `vitest` / `ultracite`（主会话统一跑）。
**不要用 chrome-devtools MCP**（用户明令禁止）。

自查清单（读代码确认，逐条在报告里回答）：

- 展开态下，品牌那块是不是**不可点**了？（不应该再有 `onClick`、
  不应该再有 hover 底色）
- 收起按钮在展开态是不是**无条件可见**（不依赖 hover / focus）？
- 收起态下，那颗 `SidebarTrigger` 是不是**不渲染或被隐藏**了？
  （轨里 32px 放不下两个可点目标）
- 收起态下品牌格是不是仍然可点、仍然有 tooltip、`aria-label` 是不是
  「展开侧边栏」？
- 13rem 下品牌名「测试用例平台」会不会被 truncate？把你的像素账算给我看。

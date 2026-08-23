# 009 — 选中态：淡底 + 左侧指示条

> Commit at authoring time: a33a38e

## Problem

「选中」这件事目前只靠一层底色说，而那层底色几乎不存在。实测（无彩色灰
C=0，`Y = L³` 精确成立，对比度 `(max+0.05)/(min+0.05)`）：

| 位置 | 底 vs 选中 | 对比度 |
|---|---|---|
| 一级侧栏 `data-active:bg-sidebar-accent`（亮） | `0.985` vs `0.97` | **1.045:1** |
| 同上（暗） | `0.205` vs `0.269` | **1.185:1** |
| 二级面板模块树 `bg-accent`（亮） | 同上 | 同上 |

三条独立的病灶：

**1）悬停态与选中态是同一个令牌。**
`packages/ui/src/components/sidebar-menu.tsx:56` 里
`hover:bg-sidebar-accent` 与 `data-active:bg-sidebar-accent` 取的是同一个值，
两态互比 **1.000:1**。`apps/web/src/components/workspace/` 下三个文件
（`module-tree-node.tsx:176`、`all-cases-link.tsx:25`、`project-overview-link.tsx:39`）
写的是 `selected ? "bg-accent text-accent-foreground" : "hover:bg-muted"`，
而亮色下 `--accent` 与 `--muted` **同为 `oklch(0.97 0 0)`**——选中与悬停
在亮色下是逐像素相同的两块颜色。

**2）收起成图标轨后，唯一还起作用的线索也没了。**
`sidebar-menu.tsx:56` 的 `group-data-[collapsible=icon]:[&>span:last-child]:hidden`
把文字标签藏了，于是 `data-active:font-medium` 失去作用对象。轨里只剩
1.045:1 / 1.185:1 的底色。更糟的是图标颜色：暗色下
`--sidebar-foreground` 与 `--sidebar-accent-foreground` **同为 0.985**，
选中与否图标一模一样；亮色下选中反而把图标从 `0.145` 改成 `0.205`，
压底从 18.958:1 **降到** 16.424:1——本该加强的冗余编码在往反方向走。

**3）选中行改文字色是负收益。** 上面那条在展开态同样成立：
`data-active:text-sidebar-accent-foreground`（0.205）比继承来的
`--sidebar-foreground`（0.145）**更浅**，两态文字互比只有 1.105:1，
且方向是错的。`hover:text-sidebar-accent-foreground` 一模一样的问题。

## Target

用户已经选定方案：**淡底 + 左侧指示条**。底色只负责「这一片是选中的」，
真正让人看见的是那条 2px 的高对比竖条。

### 一、新增填充令牌（`packages/ui/src/styles/theme.css`）

`:root`（亮色）在 `--sidebar-accent-foreground` 之后加一行：

```css
--sidebar-selected: oklch(0.9 0 0);
```

`.dark` 的对应位置加：

```css
--sidebar-selected: oklch(0.34 0 0);
```

`@theme inline` 块里（`--color-sidebar-accent-foreground` 邻近）加：

```css
--color-sidebar-selected: var(--sidebar-selected);
```

**这两个 L 值是解出来的，不是挑的**，把推导写进 theme.css 的注释里
（该文件每个令牌上方都带实测数字，照它的格式写）：

- 亮 `0.90`：压 `--sidebar`(0.985) = **1.291:1**，压悬停 `--sidebar-accent`(0.97)
  = **1.236:1**。
- 暗 `0.34`：压 `--sidebar`(0.205) = **1.524:1**，压悬停 `--sidebar-accent`(0.269)
  = **1.286:1**。
- 为什么不干脆把底色做到 3:1？亮色下要 3:1 需要 `L≈0.658`，那是一整块中灰，
  导航栏里三行有一行是深色方块，喧宾夺主。**底色本来就不该独自承担可见性**——
  这正是下面那条指示条存在的理由。填充只要压得过悬停态（1.236 / 1.286:1，
  两态不再同色）就完成了它的任务。
- 文字仍取 `--sidebar-foreground`：亮色 0.145 压 0.90 = **14.68:1**，
  暗色 0.985 压 0.34 = **11.26:1**，两边都远超 4.5:1。

### 二、指示条

统一形制，四个调用点一致：

- 用 `::before` 伪元素，不要新增 DOM 节点（模块树那一行挂着 dnd-kit 的
  碰撞盒，多一层子节点会改布局）。Tailwind v4 的 `before:` 变体会自动补
  `content: ""`，不必自己写。
- 竖条：`absolute left-0`，宽 `w-0.5`（2px），`rounded-full`，
  底色 `bg-sidebar-foreground`。
- 颜色为什么是 `--sidebar-foreground` 而不是 `--sidebar-primary`：
  前者亮 0.145 / 暗 0.985，压填充分别是 14.68:1 / 11.26:1；后者暗色是
  `oklch(0.488 0.243 264.376)` 的蓝，压 `--sidebar`(0.205) 只有 **2.625:1**，
  达不到 SC 1.4.11 的 3:1。
- 竖直方向的内缩由圆角推出：行是 `rounded-md` = 6px。
  - 一级侧栏行高 32px（`h-8`，轨里也是 `size-8!`）→ `before:inset-y-1.5`
    （6px，正好让竖条两端避开圆角圆弧），得到 20px 的条。
  - 模块树三行高 24px（`py-0.5` + `text-sm` 的 20px 行高）→ `before:inset-y-1`
    （4px），得到 16px 的条。两处都是行高的 ≈2/3。
- 只在选中时出现：`before:opacity-0` + `data-active:before:opacity-100`
  （一级侧栏）/ 由 `selected` 分支控制（模块树）。用 opacity 而不是条件渲染
  或 `hidden`，是为了让它跟着行上已有的 `transition-control` 一起淡入。
- 承载竖条的那一行要加 `relative`。

**收起态不做特例**：轨里行本身就是那 32px 的方格，`left-0` 就贴着轨的左缘，
再加偏移只会让条脱离行。

### 三、`packages/ui/src/components/sidebar-menu.tsx`

改 `sidebarMenuButtonVariants` 的基础类串（:56）：

- `data-active:bg-sidebar-accent` → `data-active:bg-sidebar-selected`
- **删掉** `data-active:text-sidebar-accent-foreground` 与
  `hover:text-sidebar-accent-foreground`。理由见 Problem 第 3 条：这两条在亮色
  下把文字改浅、在暗色下是空操作，没有一处是正收益。删掉后两态文字都继承
  `--sidebar-foreground`。
- `hover:bg-sidebar-accent` **保留不动**——悬停继续用那档极淡的灰，
  现在它与选中的填充相差 1.236:1（亮）/ 1.286:1（暗），不再撞色。
- `data-active:font-medium` **保留**（展开态的冗余编码）。
- 加上 `relative` 与 `before:*` 那一串（见上）。

**同时重写 :46-48 那段 JSDoc。** 它现在写的是「选中态给的是背景块而不是
左侧竖条：竖条要 4px 的额外内缩才不与模块树的层级缩进打架」——这段论证今天
两头都不成立：模块树早就搬进了二级面板，而且**根本不用这个组件**
（全仓 `SidebarMenuButton` 只出现在 `app-sidebar.tsx` 与 `sidebar-user.tsx`）。
新注释要写：竖条的必要性来自收起态（文字被藏、`font-medium` 失效、
底色只剩 1.045:1），以及内缩 6px 是从 `rounded-md` 推出来的。

`sidebar-user.tsx` 用的是 `size="lg"`（44px 行）且从不 `isActive`，
指示条对它是 opacity-0，无需另作处理。

### 四、`apps/web/src/components/workspace/` 三个文件

`module-tree-node.tsx:176`、`all-cases-link.tsx:25`、`project-overview-link.tsx:39`
统一改成侧栏令牌（这三行坐在 `bg-sidebar` 上——见 `secondary-panel.tsx:77`
与 `:157`——却在用 background 那一套令牌，本身就是错配）：

- 选中：`bg-sidebar-selected` + 指示条。**不要**再写 `text-accent-foreground`
  或任何文字色覆盖。
- 悬停：`hover:bg-muted` → `hover:bg-sidebar-accent`。
- `module-tree-node.tsx:178` 的 `!selected && "data-popup-open:bg-muted"`
  → `data-popup-open:bg-sidebar-accent`。
- 每行加 `relative` 与 `before:*` 串；`before:opacity-*` 由 `selected` 三元
  控制即可（这三处本来就是 `selected ? … : …` 的写法，不必引入 data 属性）。

`px-2` 与 `gap-1` 都不动——`module-tree.tsx` 顶部约定了 `px-2` 加上 aside 的
`p-2` 正好是 16px 的侧栏 gutter，指示条是绝对定位的伪元素，不占流内空间，
不影响那笔账。

## Repo conventions to follow

- 组件一律用 `packages/ui/src/components/` 里现成的（用户硬规则：
  「不到不得已，不允许自己写组件」）。本 plan 不新增任何组件。
- **`apps/web` 禁止 Tailwind 任意值**（方括号字面量），由
  `scripts/check-tailwind.js` 强制。上面用到的 `before:inset-y-1`、
  `before:w-0.5`、`before:rounded-full`、`before:bg-sidebar-foreground`
  全是标准工具类，合规。变体位置的方括号（`data-[…]:`）是允许的。
  `packages/ui/` 是 vendored 目录，不受这条约束，但也没必要用任意值。
- `theme.css` 每个令牌上方都带一段实测对比度注释，新令牌照写，数字用上面
  算好的那几个，别自己重算成别的值。
- 注释写中文，讲「为什么」不讲「是什么」。
- 单文件 300 行上限。`module-tree-node.tsx` 与 `module-tree.tsx` 都贴着上限，
  改动务必只在既有类名串里做加减，不要新增函数或组件。

## Steps

1. `packages/ui/src/styles/theme.css`：加 `--sidebar-selected`（`:root` + `.dark`）
   与 `@theme inline` 的 `--color-sidebar-selected`，各配推导注释。
2. `packages/ui/src/components/sidebar-menu.tsx`：改基础类串，重写 :46-48 的注释。
3. `apps/web/src/components/workspace/module-tree-node.tsx`
4. `apps/web/src/components/workspace/all-cases-link.tsx`
5. `apps/web/src/components/workspace/project-overview-link.tsx`

## Boundaries

- **不要动** `packages/ui/src/components/sidebar-context.tsx` 与
  `apps/web/src/components/layout/app-sidebar.tsx`——plan 008 正在改这两个，
  同时写会冲突。
- **不要动** `--sidebar-accent` / `--accent` / `--muted` 本身的值。它们还被
  其他几十处用着，改令牌值等于改全站。本 plan 只**新增**一个令牌。
- **不要动** `dropdown-menu.tsx` / `select.tsx` / `context-menu.tsx` / `tabs.tsx`
  / `table.tsx` 的高亮（审计另有发现，会另开 plan）。
- **不要动** `--sidebar-ring` 的值（亮色焦点环 2.484:1 不达标是另一条 finding）。
- 不做任何 git 写操作（commit / push / add / checkout / stash / restore / branch）。
- 不要顺手清理无关的东西。发现了就在报告里说，别自己改。

## Verification

```bash
pnpm eslint --no-cache packages/ui/src/components/sidebar-menu.tsx \
  apps/web/src/components/workspace/module-tree-node.tsx \
  apps/web/src/components/workspace/all-cases-link.tsx \
  apps/web/src/components/workspace/project-overview-link.tsx
node scripts/check-tailwind.js <改过的 apps/web 文件>
node scripts/check-file-rules.js <改过的全部文件>
```

三条都必须 exit 0。**注意 `check-*.js` 不带参数时是静默 no-op**，
一定要把文件路径传进去。

不要跑 `pnpm check-types` / `vitest` / `ultracite`（主会话统一跑）。
**不要用 chrome-devtools MCP**（用户明令禁止）。

自查清单（读代码确认，逐条在报告里回答）：

- 悬停态与选中态现在是不是两个不同的颜色值？把两个令牌名写出来。
- 收起成图标轨后，选中项还剩几条线索？（应当是**两条**：填充 + 指示条）
- 有没有哪一处还残留 `text-accent-foreground` / `text-sidebar-accent-foreground`
  这类把选中文字改浅的写法？
- 指示条会不会被 `overflow-hidden` 或圆角切掉？`inset-y-*` 与 `rounded-md`
  的 6px 是怎么对上的？
- `bg-sidebar-selected` 这个类真的会被 Tailwind 生成吗？（`@theme inline` 里
  的 `--color-sidebar-selected` 是不是加对了）

# 010 — 控件台阶整体降一档（36 → 32）

> Commit at authoring time: a33a38e（工作区已含 plans 008 / 009 的改动，未提交）

## Problem

用户的原话：「页面上的按钮应该等比例再统一缩小一下。现在太大了。」

当前 Button 的台阶是 8 档，实际有流量的只有 5 档
（`grep -rn 'size="…"' apps/web/src packages/ui/src` 的结果）：

| 档 | 现高 | 调用点数 |
|---|---|---|
| `default` | h-9 = 36px | 大量（不传 size 即此档） |
| `sm` | h-8 = 32px | 15 |
| `xs` | h-6 = 24px | 2 |
| `icon` | size-9 = 36px | 5 |
| `icon-sm` | size-8 = 32px | 2（dialog / sheet 的关闭键） |
| `icon-xs` | size-6 = 24px | 9 |
| `lg` | h-10 = 40px | **0** |
| `icon-lg` | size-10 = 40px | **0** |

`lg` 的两处 grep 命中（`app-sidebar.tsx:76`、`sidebar-user.tsx:50`）都是
`SidebarMenuButton size="lg"`，走的是 `sidebar-menu.tsx` 自己的 cva
（h-8 / h-11 / h-7），与 Button 的 `lg` 无关。**Button 的 `lg` 与 `icon-lg`
是全仓零调用的死档。**

## Target

### 台阶

| 档 | 现值 | 新值 | 说明 |
|---|---|---|---|
| `default` | `h-9`(36) | **`h-8`(32)** | |
| `sm` | `h-8`(32) | **`h-7`(28)** | |
| `lg` | `h-10`(40) | **`h-9`(36)** | 零调用，跟着降只为保住台阶完整 |
| `icon` | `size-9`(36) | **`size-8`(32)** | |
| `icon-sm` | `size-8`(32) | **`size-7`(28)** | |
| `icon-lg` | `size-10`(40) | **`size-9`(36)** | 零调用 |
| `xs` | `h-6`(24) | **不动** | |
| `icon-xs` | `size-6`(24) | **不动** | |

**`xs` / `icon-xs` 为什么不能跟着降——这是本 plan 最重要的一条约束。**
仓库里有 13 处控件现在正好压在 WCAG 2.2 SC 2.5.8 Target Size (Minimum) 的
24px 下限上，且**全部没有** `after:-inset-*` 扩靶：

`cases/steps-editor.tsx:31,41,50`、`cases/markdown-toolbar.tsx:156`、
`cases/case-conflict-alert.tsx:37`、`members/member-row-actions.tsx:40`、
`projects/project-list.tsx:76`、`workspace/module-tree.tsx:232`、
`workspace/module-tree-node.tsx:114`、`layout/project-switcher.tsx:51`、
`versions/version-list.tsx:115`、`versions/version-history-panel.tsx:99`、
`workspace/module-drag-parts.tsx:57`。

它们降到 20×20 就是当场违规。仓库里唯一做对扩靶的样板是
`packages/ui/src/components/checkbox.tsx:11`（`size-4` + `after:-inset-x-3
after:-inset-y-2` → 40×32）。要动这一档，得先给它们补扩靶——那是另一轮工作，
不在本 plan 内。**24px 是触摸下限，本轮到此为止。**

顺带一个好处：`xs` 不动，于是模块树那一整套 24px 的推导全都不受影响——
`project-overview-link.tsx:29-33` 的 `min-h-7`、`project-shell-skeleton.tsx:22-31`
的 ModuleTreeSkeleton 算式、`module-drag-parts.tsx:57` 的靶区论证、
`module-rename-input.tsx:60-76` 的 `h-6`、`project-switcher.tsx:17-82` 的箭头
中心推导，**一个字都不用改**。

### 同步降的尺寸源（不改就会有两档合并）

| 文件:行 | 现值 | 新值 |
|---|---|---|
| `packages/ui/src/components/button.tsx:21-33` | 见上表 | 见上表 |
| `packages/ui/src/components/input.tsx:9` | `h-9`、`file:h-7` | `h-8`、`file:h-6` |
| `packages/ui/src/components/select.tsx:61` | `data-[size=default]:h-9`、`data-[size=sm]:h-8` | `h-8`、`h-7` |
| `packages/ui/src/components/tabs.tsx:29` | `group-data-horizontal/tabs:h-9` | `h-8` |

**`packages/ui/src/components/sidebar-menu.tsx` 的 h-8 / h-11 / h-7 不动。**
它不在 Button 台阶上，是侧栏自己的一套。而且降完之后侧栏行（32px）与新的
Button `default`（32px）反而对齐了，本来就该保持。

### 会变成假话的注释（逐条改写，一处都不能漏）

**1. `apps/web/src/components/layout/app-shell.tsx:55-64`**

- 「最高的是 36px 的图标按钮（… Button size="icon" = size-9）」→ **32px / size-8**
- 「4 + 36 + 4 + 1 = 45px，够不到 48px」→ **4 + 32 + 4 + 1 = 41px**
- 「py 不能是 2：8 + 36 + 8 + 1 = 53px 会顶穿 min-h-12」→ **8 + 32 + 8 + 1 = 49px**。
  结论仍然成立（49 > 48），但余量从 5px 缩到 **1px**，原文那句「顶栏就比面板
  标题行多出 5px」要改成 1px，并且这句话的说服力变弱了——重写时要说清
  「即便只多 1px，两行的底边也不再齐平」。
- **布局结果不变**：45 和 41 都够不到 48，`min-h-12` 照样兜底，与
  `secondary-panel.tsx` 标题行的 48px 底边依旧齐平。**坏掉的是论证，不是布局。**

**2. `apps/web/src/components/layout/project-shell-skeleton.tsx:48-60`**
同一套推导被抄了第二份：「ProjectSwitcher 的 Button（不传 size = h-9 = 36px），
比这条高出 16px」→ **h-8 = 32px / 高出 12px**；「4 + 36 + 4 + 1 = 45px」→ **41px**。
两份必须同一次改完，否则会留下互相矛盾的两段注释。

**3. `apps/web/src/components/cases/case-filters.tsx:171-175`**
「所有控件走 default 档 = 36px（Input h-9 / SelectTrigger data-[size=default] h-9
/ Button size="default" h-9）」→ **32px / h-8 ×3**。下一句「此前用 size="sm"（h-8），
比相邻的输入框和下拉矮 4px」里的 h-8 也要跟着变成 h-7（差值仍是 4px）。

**这段注释被三个文件按名字引用**，同一次全部改掉：
- `apps/web/src/components/cases/case-tag-filter.tsx:106-107`
- `apps/web/src/components/layout/project-shell-skeleton.tsx:66-68`（「一律 h-9」→ h-8）
- `apps/web/src/components/provider/provider-config-skeleton.tsx:5`
  （**注意**：这一行现在写的是「32px 档」，本身就引错了——`case-filters.tsx`
  白纸黑字写的是 36px。降档之后 32px 反而**歪打正着变对了**。把这句话重写成
  「与 case-filters.tsx 顶部约定同档 = 32px」，不要因为它现在看着对就跳过它。）

**4. `apps/web/src/components/layout/app-sidebar.tsx`（plan 008 刚加的那颗按钮）**
现在是 `<SidebarTrigger className="size-8 shrink-0" size="icon-sm" />`。
`icon-sm` 降档后是 **28px**，会比它右边每一行导航（`h-8` = 32px）矮 4px——
正是 008 引它进来时要避免的那个问题。改成：

```tsx
<SidebarTrigger className="size-8 shrink-0" size="icon" />
```

新的 `icon` 就是 32px，与 `className` 里的 `size-8` 一致，也与侧栏行等高。
上方那段解释「size 传 icon-sm（32px）覆盖 SidebarTrigger 自带的 icon（36px）」
**整段作废**，重写成：现在 `icon` 本身就是 32px，不必再覆盖；保留显式
`size="icon"` 只是为了让这颗按钮的档位在调用点上可读。

### 会因为降档而**自动变正确**的（不要在同一轮里又去「修」它们）

- `apps/web/src/components/provider/provider-config-skeleton.tsx:42,43,70` 的 `h-8`：
  Input 降到 `h-8` 之后就与真实控件对齐了。
- `apps/web/src/components/projects/project-list.tsx:155` 的 `h-8`：
  真实按钮降到 `h-8` 之后就对了。

这两处**保持 h-8 不动**。（它们各自还有别的毛病——幽灵骨架、缺表头——
那些与台阶无关，另开 plan，本轮不碰。）

### 明确不受影响的（写出来防止误改）

`table.tsx:76,89`（`TableHead h-10` / `TableCell p-2`）、`badge.tsx:7`（h-5）、
`checkbox.tsx:11`（size-4）都不在 Button 台阶上。
`cases/case-table-states.tsx:18-19` 的骨架推导（表头 41px；数据行 p-2 16 +
Badge h-5 20 = 36px = h-9）**因此仍然成立**，不要动。
`secondary-panel.tsx` 与 `sidebar.tsx` 里的触发器都被 `min-h-12`(48px) 兜着，
36→32 之后 48px 仍然胜出，无视觉变化。

### 圆角不在本轮

`button.tsx` 的 `rounded-[min(var(--radius-md),10px)]` 与 `min(…,8px)` 在当前
令牌下是死代码：`--radius: 0.625rem`(10px) → `--radius-md: calc(10px - 2px)` =
**8px**，于是 `min(8,10) = min(8,8) = rounded-md = 8px`，三种写法恒等。
这条属实，但它是**既有**问题，与降档无关，**本 plan 不动**，留给后续。

## Repo conventions to follow

- 组件一律用 `packages/ui/src/components/` 里现成的。本 plan 不新增任何组件。
- `apps/web` 禁止 Tailwind 任意值（`scripts/check-tailwind.js`）。本 plan 用到的
  `h-7`/`h-8`/`h-9`/`size-7`/`size-8`/`size-9` 全是标准工具类。
- `packages/ui/src/components/` 是 vendored 目录（`scripts/vendored-ui.js`）：
  与 shadcn registry 的任何偏离都要在文件头部注释里写清理由，范本是
  `chart.tsx:3-13`。**本轮的台阶下调就是一次偏离**，必须在 `button.tsx` 顶部
  按那个格式补一段：写清 registry 原值（36/32/40/24）、本仓库新值、以及理由
  （信息密度：这是一个表格与树形导航为主的内部工具，不是消费级落地页），
  并注明 `xs`/`icon-xs` 刻意保持 24px 的无障碍理由。
- 单文件 300 行上限。
- 注释写中文，讲「为什么」不讲「是什么」。

## Steps

1. `packages/ui/src/components/button.tsx`：改 6 个档位的高度，补文件头部的偏离说明。
2. `packages/ui/src/components/input.tsx:9`
3. `packages/ui/src/components/select.tsx:61`
4. `packages/ui/src/components/tabs.tsx:29`
5. `apps/web/src/components/layout/app-sidebar.tsx`：`icon-sm` → `icon`，重写注释。
6. `apps/web/src/components/layout/app-shell.tsx:55-64`：重写推导注释。
7. `apps/web/src/components/layout/project-shell-skeleton.tsx:48-60,66-68`：重写两段。
8. `apps/web/src/components/cases/case-filters.tsx:171-175`：重写约定。
9. `apps/web/src/components/cases/case-tag-filter.tsx:106-107`：跟随。
10. `apps/web/src/components/provider/provider-config-skeleton.tsx:5`：重写。

## Boundaries

- **不许动 `xs` 与 `icon-xs`**（24px 触摸下限）。
- **不许动 `packages/ui/src/components/sidebar-menu.tsx`**（不在 Button 台阶上）。
- **不许动 `button.tsx` 里的圆角写法**（`rounded-[min(…)]` 那三处）。
- **不许动 `table.tsx` / `badge.tsx` / `checkbox.tsx` / `case-table-states.tsx`**。
- **不许「顺手修好」** `provider-config-skeleton.tsx:42,43,70` 与
  `project-list.tsx:155` 的 `h-8`——降档后它们自动变对，改了反而错。
- **不许动** `packages/ui/src/styles/theme.css`、`sidebar-context.tsx`、
  `apps/web/src/components/workspace/` 下的任何文件（plans 008/009 刚改过）。
- 不做任何 git 写操作（commit / push / add / checkout / stash / restore / branch）。
- 不重启或杀掉开发服务器（web `:3001`、server `:16496`）。
- 不要顺手清理无关的东西。发现了就在报告里说，别自己改。

## Verification

```bash
pnpm eslint --no-cache <改过的全部文件>
node scripts/check-tailwind.js <改过的 apps/web 文件>
node scripts/check-file-rules.js <改过的全部文件>
```

三条都必须 exit 0。**`check-*.js` 不带参数时是静默 no-op**，必须传文件路径。
不要跑 `pnpm check-types` / `vitest` / `ultracite`（主会话统一跑）。
**不要用 chrome-devtools MCP**。

自查清单（逐条在报告里回答）：

- 台阶降完后，8 个档位的实际像素值分别是多少？有没有两个档位撞到同一个值？
- `xs` 与 `icon-xs` 是不是一个字都没动？
- 全仓 grep：还有没有别的地方硬编码了 `h-9` / `size-9` 来对齐 Button 的
  default 档？（`grep -rn --include='*.tsx' 'h-9\|size-9' apps/web/src packages/ui/src`
  逐条判断它对齐的是不是 Button，是就报出来）
- 上面点名的 5 段注释（app-shell、project-shell-skeleton ×2、case-filters、
  provider-config-skeleton、app-sidebar）是不是全部改了？把改后的算式抄出来。
- `provider-config-skeleton.tsx:42,43,70` 与 `project-list.tsx:155` 的 `h-8`
  是不是**没有**被你改成 h-9？

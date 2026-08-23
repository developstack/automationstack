# 计划总览

本目录目前有两批计划，来源不同、基线不同，**不要混着读**：

| 批次 | 计划 | 来源 | 基线 commit |
| --- | --- | --- | --- |
| 第一批：交互动画 | 001–007 | `/improve-animations 增加一些交互的动画` 的审计 | `0c78c13` |
| 第二批：侧边栏与控件尺度 | 008–010 | 用户对侧栏宽度、选中态高亮、按钮尺寸的三次直接反馈 | `a33a38e` |

计划里引用的行号只对它自己那一批的基线成立。若你的工作区已经偏离，先核对行号，
对不上就停下来报告，不要凭猜测改。

---

# 第二批：侧边栏与控件尺度（008–010）

## 计划一览

| # | 计划 | 起因 | 触及文件 | 状态 |
| --- | --- | --- | --- | --- |
| 008 | [一级侧栏收窄 + 展开态显式收起按钮](008-sidebar-width-and-explicit-collapse.md) | 「一级侧边栏的宽度应该再窄一些……展开的时候 logo 旁边应该有收起的按钮」 | `sidebar-context.tsx`、`layout/app-sidebar.tsx`、`layout/app-shell.tsx` | DONE |
| 009 | [选中态：淡底 + 左侧指示条](009-selected-state-fill-and-indicator.md) | 「一级侧边栏收起的时候也没有高亮。二级侧边栏用例管理的部分高亮也不明显」 | `styles/theme.css`、`sidebar-menu.tsx`、`workspace/` 下 3 个文件 | DONE |
| 010 | [控件尺寸整条台阶下调一档](010-control-scale-step-down.md) | 「页面上的按钮应该等比例再统一缩小一下。现在太大了」 | `button/input/select/tabs.tsx`、`layout/` 3 个、`cases/` 3 个、`provider-config-skeleton.tsx` | DONE |

## 依赖关系

```
008 ──▶ 010
（008 新增的 SidebarTrigger 用 size="icon-sm"；010 把 icon-sm 降到 28px，
  该调用点必须同步改成 size="icon"，否则那颗按钮比 32px 的导航行矮 4px）

009        （独立；只改选中态的填充与指示条，不碰任何尺寸）
```

## 落地后发现的三处计划错误（已在代码里改正，留档以免重犯）

1. **009 把 `rounded-md` 算成 6px。** 实际 `--radius: 0.625rem`(10px) → `--radius-md` = **8px**。
   选定的 `before:inset-y-1.5` 仍然正确，但理由要换成「条长 20px 优于 16px」，
   而不是「让开圆弧」。
2. **009 声称指示条会跟着行的 `transition-control` 淡入。** 不成立：`transition-*`
   不被伪元素继承，`::before` 拿不到宿主的过渡声明，实际是硬切。**尚未处理**，
   要淡入得在行上补 `before:transition-control`。
3. **009 假设模块树行高 24px。** 实际是 28px（`py-0.5` + 24px 的 `icon-xs` 按钮，
   且 `project-overview-link` 有显式 `min-h-7`）。`inset-y-1` 仍给出与侧栏一致的
   20px 条长，无需改类名，只改了注释。

另有 **010 漏列一个文件**：`cases/case-list-skeleton.tsx` 是同一段工具栏骨架的第四份
拷贝，实现时被发现并单独补改（注释 36px→32px、四个 `h-9`→`h-8`）。

## 010 的一条硬约束（不要在后续计划里撤销）

`xs`(h-6) 与 `icon-xs`(size-6) **钉死在 24px**，不随台阶下调。WCAG 2.2 SC 2.5.8
Target Size (Minimum) 的下限正是 24×24，而本仓库有 13 处控件恰好压在这条线上且
**全部没有** `after:-inset-*` 扩靶。要动这一档，得先逐处补扩靶——那是独立的一轮工作。
本目录唯一做对扩靶的样板是 `packages/ui/src/components/checkbox.tsx:11`。

---

# 第一批：交互动画（001–007）

来源：`/improve-animations 增加一些交互的动画` 的审计结果。
基线 commit：`0c78c13`。

## 计划一览

| # | 计划 | 严重度 | 类别 | 触及文件 | 状态 |
| --- | --- | --- | --- | --- | --- |
| 001 | [图表动画时长收进预算](001-chart-animation-budget.md) | HIGH | 缓动与时长 | `overview/overview-chart.ts`、`overview-donut.tsx`、`overview-priority-bars.tsx` | DONE |
| 002 | [减弱动效的交叉淡入逃生口](002-reduced-motion-crossfade-escape-hatch.md) | HIGH | 可访问性 | `packages/ui/src/styles/globals.css`、`cases/case-table-states.tsx` | DONE |
| 003 | [六处浮层换成可打断的 popup-transition](003-popup-transition-swap.md) | HIGH | 可打断性 | `packages/ui/src/components/` 下 7 个文件 | DONE |
| 004 | [改筛选/翻页/开详情时不再整块换成骨架](004-no-teleport-on-filter-and-paging.md) | HIGH | 目的与频次 | `routes/projects/$projectId/index.tsx`、`cases/case-list-view.tsx`、`cases/case-table.tsx`、`cases/case-table-states.tsx` | DONE |
| 005 | [用例列表空态不再「啪」地出现](005-empty-state-entrance.md) | MEDIUM | 缺失的机会 A | `cases/case-table-states.tsx` | DONE |
| 006 | [协作头像出现时不再凭空弹出](006-collaborator-avatar-entrance.md) | MEDIUM | 缺失的机会 B | `cases/case-collaborators-cell.tsx` | DONE |
| 007 | [采纳 AI 提案时那一行「退下去」](007-proposal-acceptance-delight.md) | LOW（delight） | 缺失的机会 C | `ai/ai-proposal-item.tsx` | DONE |

001–004 是**纠正**：现在的动效在某处是错的。005–007 是**增补**：这些地方现在
没有动效，而它们应该有。

## 依赖关系

```
002 ──▶ 004 ──▶ 005
        （三者都改 cases/case-table-states.tsx，必须串行）

001    003    006    007        （彼此独立，也不依赖上面这条链）
```

- **002 → 004**：004 要用 002 引入的 `transition-crossfade` 工具类。
- **002 → 005**、**004 → 005**：005 要往 004 给 `CaseTableEmpty` 加的
  `className` prop 上合并类名；而 002 已经先改过同一个文件里的 `SWAP_ICON`。
- 002 同时也是 003、006、007 的**行为前提**（它们新增的动效都依赖「减弱动效」下
  的降级行为），但三者不改 002 触及的文件，先做后做都不会冲突，只是先做 002
  才能在验收时正确检查减弱动效那一档。

## 建议执行顺序

**第一批（可并行，互不触及同一文件）**：`002`、`001`、`003`、`006`、`007`

> 002 排在最前是因为它是链条起点，且另外三条计划的减弱动效验收都要靠它。
> 001 与 003 是杠杆最高的两条纠正：001 让概览页的图表不再自顾自播 1.5 秒，
> 003 让每天点上百次的浮层可以被打断。

**第二批**：`004`（等 002 完成）

**第三批**：`005`（等 004 完成）

## 每条计划的通用验收

所有计划都要求下列检查通过（各计划的 Verification 段还有各自额外的项）：

```bash
pnpm check-types                      # 7/7 通过
pnpm exec vitest run                  # 24 个文件 / 279 个测试
pnpm dlx ultracite check apps packages # 只应剩 3 条已知的 noConsole 警告
node scripts/check-tailwind.js <改过的文件>
node scripts/check-file-rules.js <改过的文件>
```

**已知的 3 条 `noConsole` 警告**在 `apps/server/src/index.ts` 的 :53、:66、:128，
与本批计划无关，不要顺手清理。

## 对执行者的硬性约束（两批通用）

1. **只改计划 Steps 段里点名的文件与行。** 每条计划的 Boundaries 段列出了明确
   不许碰的东西，那些不是建议。
2. **不提交、不推送、不切分支、不 stash、不 restore。** 改完留在工作区里等 review。
3. **不新增任何依赖。**
4. **不重启或杀掉开发服务器**（web `:3001`、server `:16496`）。
5. **不运行格式化工具去「顺手统一风格」**，也不要清理计划范围外的死代码。
6. **行号或代码与计划对不上就停下来报告**，不要自行推断等价位置。
7. **`packages/ui/src/components/` 是 vendored 目录**（见 `scripts/vendored-ui.js`）：
   那里的判定标准是「与 shadcn registry 一致」，任何偏离都必须在文件头部注释里
   写清楚理由——`packages/ui/src/components/chart.tsx:3-13` 是范本。

## 第一批审计中被否决、未成为计划的项

留档以免后来者重新提一遍：

- **finding 6**：三处 `transition-all`。属实，但都在低频面上，杠杆低于上面七条。
- **finding 7**：sheet 的 `ease-in-out` 与 150/200ms 不一致。真实但轻微。
- **finding 8**：`press-scale` 工具类零调用，各处按压反馈实际用的是
  `translate-y-px`。属于令牌层收敛，不是手感问题。
- **finding 9**：tooltip 的 `delay = 0`。可以争论，但改它会影响每天上百次的悬停，
  需要单独判断，不适合塞进这一批。
- **finding 10**：`globals.css` 里 `tooltip-arrow`、`transition-focus-ring`、
  `bg-muted-hover`、`bg-bubble-tinted*` ×4 全部零调用。死代码清理，不改手感。
- **finding 11**：没有统一的缓动/时长令牌层，各处硬编码 150/200/300ms。
  真正的解法是先有令牌再迁移，那是一整轮独立的工作。
- **`ease-emphasized` 的注释**（`apps/web/src/index.css:25-26`）写着「起步快、
  收尾慢」，但 `cubic-bezier(0.2, 0, 0, 1)` 的第一个控制点 `(0.2, 0)` 给出的是
  零初速度，实际是「起步慢、中段快、收尾慢」。纯注释错误，不影响行为，
  未列入本批。

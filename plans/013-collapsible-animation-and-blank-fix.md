# 013 — 修复执行台折叠区：开合动画缺失 + 收起后底部大片空白

> 基线：`682a4de` + 工作区未提交的 012 改动（同目录，注意别回滚它们）。
> Bug 修复计划，改动面：ui 包 globals.css、两个折叠组件、一个路由文件。

## 0. 成因（已诊断，执行者不必重新排查，但要复核）

- **无动画**：`packages/ui/src/components/collapsible.tsx` 是 Base UI 零样式透传；
  `globals.css` 从未定义面板高度过渡。Base UI Panel 开合时打 `data-open` /
  `data-closed`，并提供测量好的高度 CSS 变量，动画全靠项目 CSS。
- **底部空白**：`routes/projects/$projectId/test-runs/$runId/index.tsx` 的
  `EXECUTION_MAIN = "flex min-h-0 flex-col"` 缺高度约束，执行台内部整条
  `min-h-0 / flex-1 / overflow-y-auto` 链失效；较短一列被 grid stretch 出空白。

## 1. 任务

### T1 `packages/ui/src/styles/globals.css`：新增 `collapsible-panel` utility

先做（强制）：读 `node_modules/@base-ui/react`（用 pnpm 为什么路径都行）里
collapsible 的源码 / .d.ts，**核实**三件事再写 CSS：
1. 高度 CSS 变量的确切名字（记忆中是 `--collapsible-panel-height`，以源码为准）；
2. 开合状态打在 Panel 上的 data 属性（记忆中是 `data-open` / `data-closed`）；
3. 关闭时 Panel 是否等 transition 完成再卸载/置 hidden（决定退场动画能否成立；
   若它只监听 animationend 不监听 transitionend，则退场改用两段 keyframes 并在
   注释里说明为什么偏离仓库 transition 优先的约定）。

约定（与 `popup-transition` 一致，写进 utility）：
- `transition-property: height`；`duration: 150ms`；`ease-out`；`overflow: hidden`；
- 关闭态 `height: 0`，打开态 `height: var(--panel 高度变量)`；
- `&[data-instant] { transition-duration: 0s; }`（Base UI 瞬时开合标记）；
- `@media (prefers-reduced-motion: reduce)` 下 duration 归 0；
- 注释风格向 `popup-transition` 看齐：说清为什么 transition 可打断。

### T2 两处折叠区套用：`run-events.tsx` + `run-case-events.tsx`

- `CollapsibleContent` 加 T1 的 utility；**padding 内移**（`px-4 pb-4` 之类的
  pb 移到 Panel 内层第一个子元素上）：`height: 0` 压不住 padding，关到一半
  会露一条空白带。
- 箭头随开合旋转：照 `ai-proposal-item.tsx` 的现成先例——Collapsible 根挂
  `group/xxx`，ChevronDownIcon 加 `transition-transform` +
  `group-data-open/xxx:rotate-180`。
- 只动这两处；模块树 / AI 提案处的 Collapsible 本次不碰（可作后续统一）。

### T3 路由 `test-runs/$runId/index.tsx`：补高度约束

`EXECUTION_MAIN` 改为 `"flex min-h-0 flex-col lg:h-full"`。

- lg+：flex 列填满外层滚动容器 → 内部滚动链生效 → 变更历史钉在视口底部，
  空白消失；展开它时挤压的是 grid（内部滚动），页面不跳。
- <lg：保持现状（文档流滚动）。堆叠布局 grid-cols-1 每行自适应内容，
  本就没有 stretch 空白，加 h-full 反而会让两行内容溢出被裁——所以只在 lg 起。

## 2. 非目标

- 不改 ui 包 collapsible.tsx 封装本身（零样式设计保留）。
- 不动模块树 / AI 提案的折叠。
- 不动 012 的未提交改动（同目录共存）。

## 3. 验收

1. `pnpm check-types` / `pnpm check` / `pnpm test` 全绿；本次 4 个文件
   `pnpm eslint` 无新增 error。
2. 代码走查：utility 含 data-instant 与 reduced-motion 分支；两处 padding 已内移；
   箭头旋转与 AI 提案先例同构。
3. 手工冒烟（尽力，起不了 dev 就注明）：大屏执行台——展开/收起变更历史与
   判定记录有平滑高度动画、可中途反向；收起后底部无空白；左列与右栏各自
   内部滚动、外层无整页滚动条；小屏（<lg）页面仍可整页滚动、内容不被裁。

## 4. 风险

- Base UI 版本行为与记忆不符（变量名 / 属性名 / 卸载时机）→ T1 的强制核实
  步骤就是为此设的，发现不符按源码实情调整并在注释里记录。

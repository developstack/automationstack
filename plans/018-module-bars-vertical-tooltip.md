# 018 — 「按模块的通过与失败」改竖柱图 + hover 数值

> 基线：`682a4de` + 工作区未提交的 011加固–017 改动，不得回滚。
> 单文件改造：`apps/web/src/components/test-runs/report-module-card.tsx`。

## 0. 决策记录

- **D1 横→竖**：`layout="vertical"` 移除（默认 vertical=false 即竖柱），
  X 轴改模块名（截断沿用 truncateModuleName）、Y 轴改数值。
- **D2 hover 数值**：加 `ChartTooltip` + `ChartTooltipContent`（仓库现成
  封装，先例 overview-priority-bars.tsx）。同一模块的通过/失败两根柱子
  在一个 tooltip 里成组显示（ChartTooltipContent 默认行为：label=模块名，
  两条各带色点与数）。
- **D3 aria 立场更新**：原「整块 aria-hidden，读数靠表格」在无障碍上仍成立
  ——表格保留，aria-hidden 照旧（图是冗余可视化）；但 hover tooltip 是新
  增的**即时读数通道**，卡片描述不用改。
- **D4 高度**：竖柱图固定高度替代「行数×44px」：`MIN_ROW_H × 模块数`，
  上限约 320px、下限 160px（≤8 模块，MAX_CHART_MODULES 不变）。
  X 轴标签旋转不再需要——竖柱下模块名水平排，仍 7 字截断 + 完整名在表格。
- **D5 柱宽/圆角/描缝/动画全沿用**（BAR_SIZE、BAR_RADIUS、CHART_SEAM、
  CHART_ANIMATION、useChartAnimation）；不堆叠的理由（同基线比长短）注释
  保留，仅更新布局描述。
- **D6 Y 轴 allowDecimals={false}**：计数不该出现 2.5 这类刻度。

## 1. 任务

单文件 `report-module-card.tsx` 的 `ModuleBars` 改造：

1. 删 `layout="vertical"`、`margin` 沿用；`XAxis` 改
   `dataKey="moduleName"` + `tickFormatter={truncateModuleName}` +
   `axisLine/tickLine` 隐藏样式（对齐优先级柱的轴风格）；
   `YAxis` 改 `type="number"` + `allowDecimals={false}`。
2. 加 `<ChartTooltip content={<ChartTooltipContent />} cursor={false} />`
   （import 自 `@automationstack/ui/components/chart`）。
3. 两根 `<Bar>`（passed/failed）保持 dataKey/fill/seam/animation 不变；
   `barSize` 竖柱下改用 `maxBarSize={BAR_SIZE}`（竖柱按宽度分组自适应，
   钉死 barSize 在窄屏会挤压标签）。
4. 高度公式按 D4：`clamp(rows.length × 40 + 24, 160, 320)`px。
5. 头注释与「不堆叠」段同步竖柱事实；CHART_CONFIG 的 label 不变
   （tooltip 文案直接用「通过/失败」）。
6. `ModuleLegend` 不动（图标+染色仍是有效冗余编码）。

## 2. 非目标

- 不动表格、卡片结构、优先级卡（report-priority-card 本就是竖柱）。
- 不动其他图表的 tooltip 配置。

## 3. 验收

1. `pnpm check-types` / `pnpm test` 全绿；该文件 `pnpm eslint` 0 error、
   `pnpm check` 无新增。
2. 代码走查：无 `layout="vertical"` 残留；ChartTooltip 存在；
   maxBarSize 生效；Y 轴无小数刻度。
3. 3999 热更新产物编译通过；hover 观感登录墙内无法验，标注留人工。

## 4. 风险

- 模块名截断 7 字在竖柱 X 轴上仍可能挤：8 模块 × ~56px ≈ 448px 宽度下
  每标签 ~50px，7 个中文字符 14px 字号约 98px——若挤则 tick 每隔一个显示
  （interval="preserveStartEnd" 自动抽稀），recharts 默认行为即可，不另配。

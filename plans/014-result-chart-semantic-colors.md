# 014 — 测试任务图表改语义色板（用户指定四色）

> 基线：`682a4de` + 工作区未提交的 012/013 改动（同目录，不得回滚）。
> 范围：报告页「结论」相关图表（环形图 + 模块堆叠柱 + 图例）。概览页用例状态图、
> 优先级柱图用的是另一套 `--chart-*`，**不碰**。

## 0. 决策记录

- **D1 语义色替代纯灰**（用户指定，产品决策）：
  passed `#2A835F` / failed `#DF301C` / blocked `#FFD758` / skipped `#C5C1C1`。
- **D2 明暗同值**：四色在暗底全部 ≥3.58:1；亮底黄 1.39:1、浅灰 1.78:1 不足 3:1，
  但沿用本页既有无障碍立场（文字/表格是主编码，色块是冗余编码）+ 扇区描缝
  （CHART_SEAM），照用原值，实测值写进注释。**不发明用户没给的暗色变体**。
- **D3 新令牌而非改 --chart-1..5**：灰阶被概览页与优先级图共用，改了会砸到
  别处。新增 `--result-passed/failed/blocked/skipped` 四支。
- **D4 untested 不变**：仍走 `--chart-1`（它是「轨道」不是数据系列，原注释成立）。

## 1. 任务

### T1 `packages/ui/src/styles/theme.css`

- `:root` 的 `--chart-5` 之后新增四支（OKLCH 已转换好，照抄）：
  ```css
  --result-passed: oklch(0.548 0.102 162.5);  /* #2A835F */
  --result-failed: oklch(0.588 0.213 30.6);   /* #DF301C */
  --result-blocked: oklch(0.891 0.149 91.5);  /* #FFD758 */
  --result-skipped: oklch(0.814 0.004 17.2);  /* #C5C1C1 */
  ```
- `.dark` 同段位置：**同值**（照抄四行）。注释说明 D2：暗底全部 ≥3.58:1 无需镜像；
  亮底两弱色靠冗余编码立场兜底，实测值列出。
- `@theme inline` 里 `--color-chart-*` 旁新增：
  `--color-result-passed: var(--result-passed);` 等四行（`bg-result-*` 工具类
  由此生成）。
- 注释风格向 `--chart-*` 段看齐（写明来源、实测、为什么不镜像）。

### T2 `apps/web/src/components/test-runs/report-meta.ts`

- `RESULT_CHART_COLORS` 前四项改 `var(--result-passed)` 等 + swatch 改
  `bg-result-passed` 等；`untested` 保持 `--chart-1` 不动。
- **重写**该常量上方的大段注释：纯灰设计已被产品决策替代；新立场 = 语义色 +
  文字标签仍是主编码（色弱用户不丢信息）+ 实测对比度表（亮/暗）+ untested
  仍为轨道的理由。

### T3 消费组件核对（预期零改动）

- `report-result-card.tsx`、`report-module-card.tsx` 均经映射字段取色，理论上
  无需改动。逐个走查确认：没有直接写死的 `--chart-*`/`bg-chart-*`；
  swatch 字段若实际无人消费，保留字段并同步新类名即可（不删）。

## 2. 非目标

- 不动概览页（overview-*）与优先级图的灰阶。
- 不改执行台的 `RESULT_TEXT_CLASSES`（图标文字色，用户只要求图表；
  色板若日后要统一，另立需求）。

## 3. 验收

1. `pnpm check-types` / `pnpm test` 全绿；触碰文件 `pnpm eslint` 0 error；
   `pnpm check` 无新增问题。
2. grep：`RESULT_CHART_COLORS` 内无 `--chart-N`（untested 的 `--chart-1` 除外）；
   theme.css 两处（:root/.dark）四支齐全且同值；@theme inline 有 --color-result-*。
3. 构建产物验证：dev server（PORT=3999）起来后 CSS 产物含 `bg-result-passed`
   等工具类与四支变量定义（013 的做法：查 Tailwind 编译输出）。
4. 页面实机观感无法验（307 登录墙），如实标注，留给用户浏览器验收。

## 4. 风险

- 黄色与卡面近似同亮——已有 CHART_SEAM 描缝覆盖；若用户看后仍嫌糊，
  备选方案是亮底微降 L 到 ~0.78（仍有 1.9:1，靠缝与标签），本次不做。

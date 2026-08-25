# 016 — 优先级图改「石板蓝」单色阶

> 基线：`682a4de` + 工作区未提交的 011加固/012/013/014/015 改动，不得回滚。
> 用户拍板：采纳石板蓝方案（P0 最深 → P3 最浅，低饱和，明度沿用现有 chart 档）。

## 0. 决策记录

- **D1 为什么不是红/不是四色**：红=失败已被语义色占用（014/015），柱图画的是
  通过率，红柱会被读成「挂了」；四色相表达类别，而优先级是同一维度的序数强度，
  正确编码是单色相明度阶。
- **D2 蓝的定位**：蓝在 绿/红/黄/灰 的语义语言里空缺，专职「维度色」——
  不评判只分档，与结论色并排时分工清晰（彩=结论、蓝=维度）。色相 255 靠近
  sidebar-primary（264）的蓝紫家族。饱和度压低（C≈0.05）保持克制基调。
- **D3 新令牌 `--priority-0..3` 四支**：不复用也不改写 `--chart-1..5`
  （概览/AI 卡还在用）。明度逐档沿用亮色 `--chart-5/4/3/2` 的 L 值
  （0.269 / 0.371 / 0.439 / 0.556），暗色沿用暗色档（0.942 / 0.824 / 0.741 /
  0.61），只加低饱和蓝色相——对比度与既有灰阶逐档等价（L 同值、C 微量，
  压底面比值变化 <5%），照旧实测写进注释。
- **D4 两处优先级图一起切**（它们本来就刻意共用一套色阶）：
  `overview-priority-bars.tsx`、`report-priority-card.tsx` 各自的本地常量
  `PRIORITY_COLORS`。两处注释同步重写（编码理由从「灰阶隔档取色」改为
  「石板蓝明度阶 + 为什么不是红」）。

## 1. 任务

### T1 `packages/ui/src/styles/theme.css`

- `:root`（--result-* 四支之后）新增：
  ```css
  --priority-0: oklch(0.269 0.05 255); /* P0 最深 */
  --priority-1: oklch(0.371 0.05 255);
  --priority-2: oklch(0.439 0.05 255);
  --priority-3: oklch(0.556 0.045 255); /* P3 最浅 */
  ```
- `.dark` 同位置（沿暗色 chart 档的 L，最高对比给 P0）：
  ```css
  --priority-0: oklch(0.942 0.03 255); /* P0 最亮 */
  --priority-1: oklch(0.824 0.03 255);
  --priority-2: oklch(0.741 0.03 255);
  --priority-3: oklch(0.61 0.028 255);
  ```
  （暗色 C 略降：高 L 下同 C 会显得更艳，压一档保持「蓝调灰」的观感。）
- `@theme inline` 补 `--color-priority-0..3: var(--priority-N);` 四行。
- 注释：写明 D1/D2 的编码理由、L 值来源（逐档同 chart-*，对比度等价）、
  实测压 background/card 的比值（亮暗各四档，照 result-* 的注释格式）。

### T2 两个优先级组件切色 + 注释重写

- `apps/web/src/components/overview/overview-priority-bars.tsx`
- `apps/web/src/components/test-runs/report-priority-card.tsx`

两处 `PRIORITY_COLORS` 都改为 `var(--priority-0..3)`；各自头注释里
「单调色阶 P0 最深 → P3 最浅 / 隔档取色」的论证段重写为石板蓝版本
（序数编码、蓝=维度色与结论色的分工、暗色镜像 P0 反转最亮）。
注意 report 那份注释里「照抄一份而不是挪公共常量」的既有决策保留不动。

## 2. 非目标

- 不动 `--chart-1..5`、`--result-*`、概览状态环/覆盖环（015 已完成）、AI 卡。
- 不动用例表里的 P0-P3 Badge（那是另一套语义，本次只管图表）。

## 3. 验收

1. `pnpm check-types` / `pnpm test` 全绿；触碰文件 `pnpm eslint` 0 error、
   `pnpm check` 无新增问题。
2. grep：两组件的 `PRIORITY_COLORS` 内无 `--chart-*` 残留；theme.css 亮暗
   各四支 + @theme inline 四行齐全。
3. 编译产物（3999 常驻 dev server 热更新输出）含 `--priority-*` 变量定义；
   两组件模块输出引用 `var(--priority-*)`。
4. 页面观感登录墙内无法验，如实标注。

## 4. 风险

- 石板蓝与暗色底面：L 逐档同暗色 chart 档，等价成立；若实机看后觉得暗色
  P3（0.61）与轨道混淆，可微调，本次按等价值走。

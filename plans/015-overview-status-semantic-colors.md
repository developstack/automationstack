# 015 — 概览页状态环改语义色（复用 014 的 --result-* 令牌）

> 基线：`682a4de` + 工作区未提交的 011加固/012/013/014 改动，不得回滚。
> 用户映射：生效=通过色 / 草稿=阻塞色 / 废弃=跳过色。

## 0. 决策记录

- **D1 范围**：`overview-totals-card.tsx`（状态环，直接命中映射）+
  `overview-coverage-card.tsx`（覆盖环——两环在既有设计里刻意「一套规矩」，
  状态环转语义色后覆盖环跟着转才不破对；映射按健康度：
  有生效=passed 绿 / 无生效=blocked 黄 / 零用例=skipped 灰）。
  **不动**：AI 卡（采纳率，非状态）、优先级柱（单调色阶）、两卡的
  `--chart-1` 轨道。
- **D2 复用 014 令牌**：`--result-passed/failed/blocked/skipped` 已存在
  （明暗同值），不新增令牌、不改值。failed 本次无对应状态，不出现。
- **D3 深浅注释重写**：旧「深浅跟着生命周期走」的灰阶梯度论证不再成立
  （草稿黄 L=0.891 反而比废弃灰 L=0.814 浅）——语义即层次，注释如实改写。
- **D4 对比度立场同 014**：亮底黄 1.39:1 / 灰 1.78:1 不足 3:1，靠
  文字标签主编码 + OverviewDonut 已有 CHART_SEAM 描缝兜底，写进注释。

## 1. 任务（两个文件，注释 + 取色）

### T1 `overview-totals-card.tsx`

`STATUS_SLICES` 改为：
```ts
active:     { color: "var(--result-passed)",  swatch: "bg-result-passed" },
deprecated: { color: "var(--result-skipped)", swatch: "bg-result-skipped" },
draft:      { color: "var(--result-blocked)", swatch: "bg-result-blocked" },
```
重写其上注释：映射来源（用户指定的状态↔结论色关系，015）、复用 014 令牌
不另立、D3 的语义即层次、D4 对比度兜底；「图例色块必须与扇区同色」的既有
理由保留；关于 case-table 状态点的那段对比（旧文说「图上是深灰、下面是绿点」）
按新事实改写——如今两边都是绿系（case-table 用 bg-success），语义方向一致
了，但令牌仍不同源，跨页一致性仍让位于「图例=扇区同色」。

### T2 `overview-coverage-card.tsx`

`COVERAGE_SLICES` 三项改：
covered → `var(--result-passed)` / `bg-result-passed`；
no-active → `var(--result-blocked)` / `bg-result-blocked`；
empty → `var(--result-skipped)` / `bg-result-skipped`。
重写其上注释：健康度语义（绿=有生效、黄=有但无生效、灰=零用例）、
与状态环「一套规矩」在新色彩空间里延续、D4 兜底、轨道仍 --chart-1。

## 2. 非目标

- 不动 AI 卡、优先级柱、报告页（014 已完成）。
- 不动 case-table 的状态点色。
- 不新增/修改 theme.css（014 令牌直接用）。

## 3. 验收

1. `pnpm check-types` / `pnpm test` 全绿；两文件 `pnpm eslint` 0 error、
   `pnpm check` 无新增问题。
2. grep：两文件不再含 `--chart-2/3/5`（`--chart-1` 轨道除外）；
   `bg-result-*` 工具类已被 014 生成（theme.css 里确认，本次无需新增）。
3. 编译产物（PORT=3999 若仍被 dev server 占用则直接查其热更新输出）：
   两文件的 `var(--result-*)` 引用出现。
4. 页面实机观感无法验（登录墙），如实标注。

## 4. 风险

- 两环相邻的浅色扇区（黄/灰）在亮底靠缝分开——donut 已有描缝，接受。
- 用户若后续把「草稿/废弃」的色感与报告页「阻塞/跳过」混淆：这是刻意的
  语义借用（状态借用结论色），注释里写明来源即可。

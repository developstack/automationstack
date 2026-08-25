# 012 — 测试任务执行台的左栏整理（对齐 / 结论跳转规则 / 去统计条）

> 基线 commit：`682a4de`，工作区干净。
> 全部改动在 `apps/web/src/components/test-runs/`，不动 ui 包、不动后端。

## 0. 三个需求的决策记录

- **D1 结论跳转**：通过 / 跳过 → 自动跳下一条；失败 / 阻塞 → **留在原地**。
  理由：`needsVerdictDetails` 下这两种结论会展开说明框 / 附件 / 缺陷面板，
  跳走等于逼用户再点回来。已有先例：`handleReset`（打回未测）就是留在原地。
  快捷键走同一个 `handleVerdict`，行为自动一致。
- **D2 统计条移除**：删 CountChip 行。它同时是筛选器，功能不丢——在
  「全部模块 / 全部人」同排加「全部结论」Select。顶栏 header 的
  「完成 3/9 · 通过率」不在去除范围。
- **D3 对齐规范（写死，不许自由发挥）**：
  - 左栏所有段（筛选行 / 批量条 / 清单）统一水平内边距 `px-2`；
  - 段与段之间一律由 `RunCaseList` 外层 `gap-2` 提供垂直间距，
    **任何段不再自带垂直 padding**（chips 行的 `p-2` 随组件删除）；
  - `RunCaseList` 容器加 `pt-2`（chips 删除后顶行不再贴住 header 的 border-b）；
  - 控件高度统一 h-7（Button sm 与 SelectTrigger sm 已一致，不改 ui 包）；
  - 不追求「用例行文字与上方控件文字」同起点——清单行带图标/复选框是内容缩进，
    天然更深，保持现状。

## 1. 改动任务（按文件，串行即可）

### T1 `run-execution-meta.ts` + `run-execution-meta.test.ts`

新增纯函数（放在 `nextRunCaseId` 旁）：

```ts
/** 打完结论是否自动跳下一条（plan 012 D1）：失败/阻塞要留在原地填说明与缺陷。 */
const AUTO_ADVANCE_RESULTS: ReadonlySet<TestRunCaseResult> = new Set([
	"passed",
	"skipped",
]);
export function shouldAutoAdvance(result: TestRunCaseResult): boolean {
	return AUTO_ADVANCE_RESULTS.has(result);
}
```

测试：四值各一条断言（passed/skipped true；failed/blocked false）。
纯函数 + 测试，与该文件现有风格一致。

### T2 `run-execution-view.tsx`

`handleVerdict` 改为：

```ts
setResult.mutate({ result, runCaseId: selected.runCase.id });
if (shouldAutoAdvance(result)) {
	const next = nextRunCaseId(visibleCases, selected.runCase.id);
	if (next !== null) onSelectRunCase(next);
}
```

注释同步改：通过/跳过跳下一条；失败/阻塞留原地（引 D1）。
`counts` 的 useMemo 保留（header 还要用）。

### T3 `run-case-filters.tsx`

- 删除 `CountChip` 组件、chips 行、`counts` prop、`RESULT_ICONS` 等
  随之多余的 import。
- 「全部结论」Select：options = 全部结论 + `RESULT_ORDER` 五项
  （label 用 `RESULT_LABELS`，值即 result 字符串；`all` 表示不过滤）。
  排在「全部模块」之前（结论筛选比模块更常用）。尺寸 `size="sm"`，
  aria-label「按结论筛选」，与现有两个 Select 完全同构。
- 三件套删除后若 `RunCaseFilter.result` 的类型仍是
  `TestRunCaseResult | undefined`——不动它，语义没变。

### T4 `run-case-list.tsx` + `run-case-bulk-toolbar.tsx`

- `RunCaseList`：容器类名 `flex min-h-0 flex-col gap-2 border-r` →
  尾部加 `pt-2`；`allCases` prop 与内部 `counts` useMemo 删除
  （唯一消费者是 filters 的统计条）。
- `RunCaseFilters` 调用点同步删 `counts`。
- `BulkToolbar`：`px-2` 保持，无需其他改动（对齐靠 D3 规范由外层保证）。

### T5 `run-case-panel.tsx`

快捷键提示文案「打完自动跳下一条」改为如实描述：
「快捷键 P/F/B/S，通过/跳过自动跳下一条，失败/阻塞留在本条填写说明」
（措辞可微调，信息点不变：两类行为不同）。

## 2. 非目标

- 不动 ui 包（高度、ps/pl 特例属于全局样式）。
- 不动顶栏 header 的统计。
- 不动 `use-run-shortcuts.ts`（键盘路径复用 handleVerdict，自动继承）。
- 不动用例行的内容缩进（见 D3 最后一条）。

## 3. 验收标准

1. `pnpm check-types`、`pnpm check`、`pnpm test` 全绿；对本次改动文件
   `pnpm eslint` 0 error（仓库存量 error 是 phase2 遗留，见 011 交付报告，
   只要不在本次文件即可）。
2. 代码走查：左栏三段 px-2 / gap-2 / pt-2 落实；chips 相关代码全删干净
   （grep CountChip / countResults in filters 无残留）。
3. `shouldAutoAdvance` 测试四值全覆盖。
4. 手工冒烟（可选项，本地 dev 起不起都行，起不了注明）：左栏顶部只有一行
   三个 Select + 批量条，垂直节奏均匀；点通过跳下一条、点失败留原地。

## 4. 风险

- 「全部结论」下拉的 value 需与 `filter.result` 的 `undefined`（全部）区分，
  用与模块筛选相同的 `all` 哨兵模式。
- `run-case-filters.tsx` 删掉大半后文件头注释里「三组筛选」的描述要改成
  「一行三个筛选」。

# 005 — 用例列表空态不再「啪」地出现

- **Status**: TODO
- **Severity**: MEDIUM
- **Category**: 8 — 缺失的机会（Missed opportunity A）
- **Commit**: 0c78c13
- **Estimated scope**: 1 个文件，约 +18 / -2 行
- **依赖 004**（004 会给 `CaseTableEmpty` 加上 `className` 这个 prop，本计划要往
  同一个位置合并类名）。**先 004 后 005。**

## Problem

`apps/web/src/components/cases/case-table.tsx:173-177` 在结果为空时直接换成
`<CaseTableEmpty>`：

```tsx
/* apps/web/src/components/cases/case-table.tsx:173-177 — current */
	if (cases.length === 0) {
		return (
			<CaseTableEmpty filtered={filtered} onClearFilters={onClearFilters} />
		);
	}
```

React 在这个位置上换的是两个**不同的组件类型**（`Table` ↔ `CaseTableEmpty`），
所以每次「有结果 → 没结果」都是一次真正的卸载 + 挂载：一整张表在一帧之内消失，
一个居中的虚线框在同一帧出现。

这一下之所以扎眼，不在于它快，而在于它**没有交代**。用户刚敲下一个关键词，
屏幕上几十行内容整块消失，第一反应是「是不是出错了 / 数据没了」——文案要读第二眼
才能推翻这个判断。做完 004 之后这一下会**更**显眼：改筛选不再插一段骨架，
表格→空态成了直接对切，中间连一个过渡状态都没有了。

反过来，空态自己已经把这件事做对过一次。同一个文件里 `CaseEmptyIcon`
（`case-table-states.tsx:60-72`）为了「筛选态 ↔ 非筛选态」两枚图标的切换，
专门写了叠放 + 交叉淡入，注释里写着「避免切换时图标『啪』地跳一下」。
图标那一级不许跳，承载图标的整块反而在跳。

频次：筛选到零结果是数十次/天里的一小部分，但每一次都发生在用户**最没把握**的
时刻（刚改完条件、正在等答案），是这一页情绪成本最高的一帧。

## Target

给空态一次进场：透明度 0 → 1，同时从下方 4px 升上来，200ms。

```tsx
/* apps/web/src/components/cases/case-table-states.tsx — target */

/**
 * 空态的进场。这里用 keyframes（tw-animate-css 的 animate-in）而不是像
 * CaseEmptyIcon 那样用 transition，是因为两者要解决的问题不同：图标那一对
 * 始终留在 DOM 里、只切 opacity，可打断的补间才接得上来回快切；这一块是
 * 真正的挂载，元素上一帧还不存在，没有「当前值」可供插值，只有 keyframes
 * 能给出首帧。这块也不会被反复快切——一旦为空就停在这里，直到下一次查询回来。
 *
 * fade + 4px 上浮，不做缩放：这是一块占满剩余高度的大面积虚线框，缩放会让
 * 它的边框整体涨缩一下，比硬切还吵；4px 的位移只够读出「它是刚出现的」。
 * 200ms 对齐仓库里对话框那一档（dialog.tsx / alert-dialog.tsx），比高频
 * 浮层的 150ms 慢一档——这一块面积大、出现得少，值得多给一拍。
 *
 * 「减弱动效」下由 globals.css 末尾那条规则压到近似瞬时，退回硬切，符合预期。
 */
const EMPTY_ENTER_CLASS = "animate-in fade-in-0 slide-in-from-bottom-1 duration-200";

export function CaseTableEmpty({
	className,
	filtered,
	onClearFilters,
}: CaseEmptyProps) {
	return (
		<Empty className={cn(EMPTY_ENTER_CLASS, className)}>
			…内部原样不动…
		</Empty>
	);
}
```

（`animate-in` / `fade-in-0` / `slide-in-from-bottom-1` / `duration-200` 全部是
`tw-animate-css@1.4.0` 与 Tailwind 内建的具名类，不含任何任意值，
`scripts/check-tailwind.js` 不会拦。）

## Repo conventions to follow

- **类名常量提到模块作用域并配一段中文块注释解释「为什么是这个值」**。同一个文件
  里 `SWAP_ICON`（`case-table-states.tsx:48`）与 `SKELETON_ROW_KEYS`（:14）就是
  这个写法，`CaseTableSkeleton` 上方那段逐像素折算的注释是密度参照。
- **类名合并一律用 `cn()`**，且**外部传入的 `className` 排在最后**，这样调用方
  永远能覆盖默认值（`PresenceAvatar`、`Empty` 本身都是这个次序）。
- **不引入动画库。** 这个文件所在的 `apps/web` 里 `motion` 只在两个文件用到
  （`layout/page-transition.tsx`、`overview/overview-chart.ts`），列表页不属于
  那两处；纯 CSS 能做到就不加节点。

## Steps

1. 确认 004 已经落地：`apps/web/src/components/cases/case-table-states.tsx` 里的
   `CaseEmptyProps` 必须已经有 `className?: string`，且 `CaseTableEmpty` 已经把
   它传给 `<Empty>`。**没有的话停下来报告**，不要自己补 004 的内容。
2. 在 `CaseTableEmpty` 函数**上方**加上 Target 段里那段带注释的
   `EMPTY_ENTER_CLASS` 常量。
3. 把 `<Empty className={className}>` 改成
   `<Empty className={cn(EMPTY_ENTER_CLASS, className)}>`。
4. 确认文件顶部已有 `import { cn } from "@automationstack/ui/lib/utils";`
   （第 11 行，已经有了）。

## Boundaries

- **不要动 `CaseEmptyIcon` 与 `SWAP_ICON`。** 那一对是叠放交叉淡入，注释里写明了
  为什么是 transition 而不是 keyframes——那是已经定下来的决定，不要重新讨论，
  也不要「顺手统一成一种写法」。
- **不要动 `CaseTableSkeleton`。** 它上方那段 41 + 6×37 = 263px 的折算是行高
  硬约束，加任何类都可能影响它替代的那块高度。
- **不要动 `case-table.tsx`。** 本计划一个字都不需要改那个文件。
- **不要给 `<Table>` 也加进场动画。** 表格回来是被预期的（用户刚放宽了条件），
  而且它是这一页的高频路径，每次翻页都淡一下是纯粹的注意力税。
- **不要给空态加固定高度或 `min-h-*` 去消掉表格→空态的高度变化。** 那需要一个新的
  具名 `@utility`（`apps/web` 禁任意值），且要和 263px 的行高折算绑死，
  超出本计划范围。如果你觉得这个高度跳变值得处理，**报告，不要动手**。
- **不要新增依赖。**
- 若步骤里引用的行号或代码与你看到的对不上，**停下来报告**。

## Verification

- **Mechanical**：
  - `pnpm check-types` — 7/7 通过。
  - `pnpm exec vitest run` — 24 个文件 / 279 个测试全绿。
  - `pnpm dlx ultracite check apps packages` — 只应剩已知的 3 条 `noConsole` 警告。
  - `node scripts/check-tailwind.js apps/web/src/components/cases/case-table-states.tsx` — 退出码 0（成功时会打印一行 ✅，不是错误）。
  - `node scripts/check-file-rules.js apps/web/src/components/cases/case-table-states.tsx` — 退出码 0（成功时会打印一行 ✅，不是错误）。
- **Feel check**：进入一个有用例的项目，打开 DevTools → Animations 面板，速度调到 10%。
  1. 在筛选栏输入一个必然无结果的关键词。空态应当**淡着升上来**，而不是瞬间出现。
     10% 速度下能看到它从透明、下移 4px 的位置走到最终位置。
  2. 再改一次关键词，**仍然无结果**。空态**不应该**重播进场——它没有被卸载过，
     动画只在挂载那一次跑。若每敲一个字空态就闪一次，说明进场类挂到了会随
     每次渲染重建的地方（比如给元素加了会变的 `key`）。
  3. 清除筛选，让表格回来。表格**不应该**有任何进场动画。
  4. 冷启动一个本来就没有用例的模块：空态会跟着页面进场一起淡入一次，两段淡入
     叠在一起应当读起来像一段（`PageTransition` 300ms 外层 + 这里 200ms 内层），
     不应该出现「先亮后暗再亮」的跳变。
  5. **减弱动效**：DevTools → Rendering → `prefers-reduced-motion: reduce`，
     重复第 1 步。空态应当直接出现（硬切），不再上浮。
- **Done when**：
  - `grep -n 'EMPTY_ENTER_CLASS' apps/web/src/components/cases/case-table-states.tsx` 命中 2 处。
  - `git status --porcelain` 的输出与你动手前**完全一致**（本仓大量文件尚未纳入 git，
    `git diff --stat` 看不到未跟踪文件的改动，不能用它当判据）；
    确认你只碰了 `case-table-states.tsx` 一个文件。
  - Feel check 的第 1、2、3 条同时成立。

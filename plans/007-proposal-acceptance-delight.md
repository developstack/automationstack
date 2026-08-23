# 007 — 采纳 AI 提案时，那一行「退下去」而不是「跳一下」

- **Status**: TODO
- **Severity**: LOW（delight）
- **Category**: 8 — 缺失的机会（Missed opportunity C）
- **Commit**: 0c78c13
- **Estimated scope**: 1 个文件，约 +26 / -2 行
- **无依赖**，可与 001–006 任意顺序并行。

## Problem

AI 生成用例是这个产品里**唯一一个「等了很久、然后收获一批东西」的时刻**：用户描述
需求、等模型跑完、拿到十几条提案、逐条勾选、点「采纳」。全流程唯一的正反馈是一条
toast。

而提案行本身对「被采纳」这件事的表达是一次硬跳。
`apps/web/src/components/ai/ai-proposal-item.tsx:98-100`：

```tsx
/* apps/web/src/components/ai/ai-proposal-item.tsx:98-100 — current */
	const handled = entry.status !== "proposed";
	const checkboxId = `ai-proposal-${entry.id}`;

	return (
		<li className={cn("rounded-lg border p-3", handled && "opacity-60")}>
```

`opacity-60` 没有任何 transition。采纳成功那一帧，被选中的每一行同时从 100% 掉到
60%，同时每一行的徽章区多出一枚「已采纳」——一次采纳十条，就是十行同时跳、十枚徽章
同时冒出来。这是整个流程的收尾，却是全流程里最生硬的一帧。

同一个文件里已经有过更细的讲究：`CollapsibleTrigger`（第 114 行）为了一个
「查看步骤」的文字颜色变化挂着 `transition-control`，箭头翻转挂着
`transition-transform`，注释里还解释了为什么箭头必须转。一个次要触发器的颜色都值得
补间，主流程的结果反馈反而在跳。

`ProposalHeader`（第 67-84 行）里那枚状态徽章同样是硬出现：

```tsx
/* apps/web/src/components/ai/ai-proposal-item.tsx:80-82 — current */
			{handledLabel === null ? null : (
				<Badge variant="secondary">{handledLabel}</Badge>
			)}
```

频次：AI 生成属于「偶尔用一次」的路径，纯按频次算这是 LOW。它值得做的理由不是频次，
而是**这是本产品少数几个用户会带着期待走进来的时刻**——delight 预算就该花在这种地方，
而不是摊到每天点一百次的按钮上。

## Target

两件事：让那一行**退下去**，让那枚徽章**浮现**。

```tsx
/* apps/web/src/components/ai/ai-proposal-item.tsx — target */

/**
 * 已处理的行淡到 60% 的过渡。
 *
 * 刻意**不**复用 transition-control（150ms）：那一档服务的是「我按下去了」
 * 这类要求即时回应的交互，快是它的全部意义。这里表达的是相反的东西——
 * 一行提案被采纳之后从待办里**退场**。300ms 让这一步读起来是「让位」
 * 而不是「被关掉」，一次采纳十行时，十行一起缓缓退下去也不像十盏灯同时灭。
 *
 * 只列 opacity：边框与圆角不变，transition-all 会把 padding / border-color
 * 一并卷进来，行数一多就是白烧的合成开销。ease-out 与仓库其余过渡同向：
 * 起步快、收尾慢，符合「东西被放下」的物理直觉。
 *
 * 这是全流程的收尾反馈，不是高频交互——它每次生成只会发生一到两次。
 */
const HANDLED_TRANSITION = "transition-opacity duration-300 ease-out";

	return (
		<li
			className={cn(
				"rounded-lg border p-3",
				HANDLED_TRANSITION,
				handled && "opacity-60"
			)}
		>
```

```tsx
/* apps/web/src/components/ai/ai-proposal-item.tsx — target，ProposalHeader */

/**
 * 状态徽章的进场。它是「采纳成功了」这句话的**唯一常驻证据**——toast 几秒后就
 * 消失，行淡下去只说明「这行不用管了」，说不出是采纳还是拒绝。所以它出现的
 * 那一下值得被看到。
 *
 * 200ms 比行退场的 300ms 快一档，两者同时开始：徽章先站定，行再退到底。
 * 顺序反过来（行先淡完、徽章才出现）会读成两件互不相干的事。
 *
 * slide-in-from-left-1：徽章总是接在前面两枚徽章之后，从左边 4px 处滑进来，
 * 方向与它在这一行里的位置一致——像是接上去的，而不是叠上去的。
 *
 * 元素在状态翻转前根本不存在（handledLabel 为 null），所以这里只能用
 * keyframes：没有「当前值」可供 transition 插值。它也不会被快切——
 * 一旦采纳/拒绝就停在这里。
 */
const BADGE_ENTER = "animate-in fade-in-0 slide-in-from-left-1 duration-200";

			{handledLabel === null ? null : (
				<Badge className={BADGE_ENTER} variant="secondary">
					{handledLabel}
				</Badge>
			)}
```

`animate-in` / `fade-in-0` / `slide-in-from-left-1` / `duration-200` /
`transition-opacity` / `duration-300` / `ease-out` 全是 `tw-animate-css@1.4.0`
与 Tailwind 内建的具名类，不含任意值，`scripts/check-tailwind.js` 不会拦。

「减弱动效」下两者都由 `globals.css` 末尾那条规则压到近似瞬时，退回当前的硬切行为。

## Repo conventions to follow

- **类名常量提到模块作用域并配一段中文块注释解释「为什么是这个值、为什么不是另一个」**。
  同一个文件里 `HANDLED_LABELS`（:27-31）与第 115-116 行那段箭头注释是密度参照。
- **`cn()` 的参数次序按「基类 → 本地默认 → 条件覆盖」**，条件项排最后。
- **`Badge` 接受 `className` 并用 `cn` 合并**（`packages/ui/src/components/badge.tsx`），
  直接传即可，不要包一层 `<span>`。
- **不引入动画库。** 这个文件所在的 `apps/web` 里 `motion` 只在
  `layout/page-transition.tsx` 与 `overview/overview-chart.ts` 用到。
- **不改 `packages/ui`。**

## Steps

1. 在 `HANDLED_LABELS`（第 27-31 行）之后加上 Target 段里那段带注释的
   `BADGE_ENTER` 常量。
2. 把第 80-82 行的 `<Badge variant="secondary">{handledLabel}</Badge>` 改成带
   `className={BADGE_ENTER}` 的形式（`className` 按字母序排在 `variant` 之前）。
3. 在 `ProposalRow`（第 93 行）**上方**、模块作用域里加上 Target 段那段带注释的
   `HANDLED_TRANSITION` 常量。
4. 把第 102 行的 `<li className={cn("rounded-lg border p-3", handled && "opacity-60")}>`
   改成 Target 段里的三参数形式。
5. 不需要新增 import（`cn` 已在第 17 行导入，`Badge` 在第 8 行）。

## Boundaries

- **不要动 `memo`（第 138 行）或它上方那段注释。** 那段注释记着实测数据
  （100 条提案下单行勾选 40–110ms），是已经论证过的性能决定。
- **不要动 `CollapsibleTrigger` 上已有的 `transition-control` 与
  `transition-transform`**，也不要动第 115-116 行那段箭头注释。
- **不要给整份提案列表加进场或 stagger。** 一次生成可能有上百条
  （见 memo 那段注释），逐条错开进场会把「结果到了」拖成一段几秒的演出，
  而且那是每次生成都要付的成本。
- **不要动 `apps/web/src/components/ai/use-ai-proposal-actions.ts`**——
  toast 文案、invalidate 时机、mutation 回调都不在本计划范围内。
- **不要把已采纳的行从列表里移除或折叠掉。** 它留在原地是有意的：用户需要
  能回看这一批里哪些采纳了、哪些拒绝了。
- **不要加 confetti、音效、震动或任何一次性庆祝效果。** 这是一个内部测试管理
  工具，delight 的形态是「动作干净利落」，不是「放烟花」。
- **不要新增依赖。**
- 若步骤里引用的行号或代码与你看到的对不上，**停下来报告**。

## Verification

- **Mechanical**：
  - `pnpm check-types` — 7/7 通过。
  - `pnpm exec vitest run` — 24 个文件 / 279 个测试全绿。
  - `pnpm dlx ultracite check apps packages` — 只应剩已知的 3 条 `noConsole` 警告。
  - `node scripts/check-tailwind.js apps/web/src/components/ai/ai-proposal-item.tsx` — 退出码 0（成功时会打印一行 ✅，不是错误）。
  - `node scripts/check-file-rules.js apps/web/src/components/ai/ai-proposal-item.tsx` — 退出码 0（成功时会打印一行 ✅，不是错误）。
- **Feel check**：进入某个项目的 AI 生成页面，生成一批提案（至少 5 条）。
  打开 DevTools → Animations 面板，速度调到 10%。
  1. 勾选 3 条，点「采纳」。这 3 行应当**一起缓缓淡到 60%**，每行的「已采纳」
     徽章从左边浮进来。**不应该有任何一帧的硬跳。**
  2. 徽章应当**先站定**，行再退到底（200ms vs 300ms）。若顺序反了或同时结束，
     说明两个时长写混了。
  3. 未被勾选的那几行**一动不动**，不透明度不变、没有徽章。
  4. 展开某一行的「查看步骤」再采纳它。步骤区应当**保持展开**——若它折叠了，
     说明这一行被重新挂载了（`key` 或 `memo` 被动过）。
  5. 换成「拒绝」再走一遍第 1 步。表现应完全一致，只是徽章文字变成「已拒绝」。
  6. 一次勾选**全部**（用全选，若列表有几十条）再采纳。整块应当是一次平顺的
     整体淡出，不应看到明显的逐行错拍或掉帧。若卡顿，在 Performance 面板确认
     是否掉出 60fps 并**报告**，不要自行改成 `will-change` 或减少行数。
  7. **减弱动效**：DevTools → Rendering → `prefers-reduced-motion: reduce`，
     重复第 1 步。应当退回当前的硬切行为，徽章直接出现。
- **Done when**：
  - `grep -c 'HANDLED_TRANSITION\|BADGE_ENTER' apps/web/src/components/ai/ai-proposal-item.tsx` 为 `4`。
  - 只碰了 `ai-proposal-item.tsx` 一个文件（本仓大量文件尚未纳入 git，
    `git diff --stat` 看不到未跟踪文件的改动，不能用它当判据）。
  - Feel check 的第 1、2、4 条同时成立。

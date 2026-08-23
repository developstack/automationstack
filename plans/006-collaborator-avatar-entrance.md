# 006 — 协作头像出现时不再凭空弹出

- **Status**: TODO
- **Severity**: MEDIUM
- **Category**: 8 — 缺失的机会（Missed opportunity B）
- **Commit**: 0c78c13
- **Estimated scope**: 1 个文件，约 +22 / -1 行
- **无依赖**，可与 001–005 任意顺序并行。

## Problem

用例列表「协作」列的头像来自 WebSocket 推送：别人打开一条用例，这一行就多一枚
头像；别人关掉，头像就消失。`apps/web/src/components/cases/case-collaborators-cell.tsx:143-149`：

```tsx
/* apps/web/src/components/cases/case-collaborators-cell.tsx:143-149 — current */
				{visible.map(({ collaborator, editing }) => (
					<PresenceAvatar
						className={cn(AVATAR_SIZE, editing ? EDITING_RING : undefined)}
						key={collaborator.clientId}
						name={collaborator.name}
					/>
				))}
```

这是整个界面里**唯一一处不由本人操作触发的视觉变化**。别的动效都在回答「我刚做了
什么」，这一处在回答「别人刚做了什么」——而它现在的表达方式是：一张脸在某一帧凭空
出现在表格中间。眼睛对余光里的突变极其敏感，正在读第 12 行的人会被第 3 行的一次
弹出拽走注意力，然后还得自己去找刚才是哪里变了。

问题不是「变化不该被看见」——恰恰相反，这一列存在的全部意义就是让人看见。问题是
**硬切没有指向性**：它只说「有东西变了」，没说「多了一个人」。一段 fade + 轻微放大
把同一个事实讲成了「有人加进来了」，注意力成本反而更低，因为看一眼就懂，不用回溯。

这不是重新讨论已经定下来的事。`realtime/presence-avatar.tsx` 的注释里写着
「**不传 animate**：这两处都是高频界面……会动的头像在表格里是纯粹的注意力税」——
那说的是 blobatar 自己的 `animate` prop，即**持续**变形的头像（而且会把每枚从一个
`<img>` 换成十几个 SVG 节点）。本计划加的是**一次性的进场**：只在挂载那一帧跑
200ms，跑完就是一张完全静止的 `<img>`，节点数不变。那条注释反对的「持续动」与这里
的「出现一次」是两件事，而且它给出的理由（注意力税、节点数）本计划一条都不触发。

频次：协作列每行都有，但真正**变化**的时刻取决于团队规模——多人同时在用时是数十
次/天，单人使用时是零。属于「不常发生、但发生时必须被读懂」的一类。

## Target

在**调用方**（协作列这一处）给头像加一次进场，不动 `PresenceAvatar` 本身。

```tsx
/* apps/web/src/components/cases/case-collaborators-cell.tsx — target */

/**
 * 头像的一次性进场。
 *
 * 加在**这里**而不是 PresenceAvatar 里：顶栏那组在线成员
 * （realtime/presence-avatars.tsx）常驻在视线正上方，用户本来就盯着它，
 * 那里的变化不需要额外指路；表格里这一列散落在几十行中间，是余光里的变化，
 * 需要一段动作把「多了一个人」讲清楚。同一个组件、两种上下文，进场只属于
 * 其中一种。（这也是 PresenceAvatar 把 className 交给调用方的既定用法。）
 *
 * 与 presence-avatar.tsx 里「不传 animate」那条决定不冲突：那条反对的是
 * blobatar 持续变形的头像（会把每枚从一个 <img> 换成十几个 SVG 节点，
 * presence 一变整堆重渲染）；这里是挂载时跑一次的 CSS keyframes，
 * 跑完节点与静止时完全一致。
 *
 * fade + zoom-in-95，200ms：20px 见方的小图形，5% 的放大只有 1px，
 * 读起来是「浮现」而不是「弹出」；比 95 更小会变成真正的弹跳，
 * 在一列有 ring 描边的圆形里会像抖了一下。
 *
 * 只做进场不做退场：退场需要把已经离开的人继续留在 DOM 里等动画播完，
 * 而这一列的数据源是 presence 推送、没有过渡状态可挂。取舍是明确的——
 * 「多了一个人」是需要被注意到的信息，「少了一个人」不是。
 *
 * 「减弱动效」下由 globals.css 末尾那条规则压到近似瞬时，退回硬切。
 */
const AVATAR_ENTER = "animate-in fade-in-0 zoom-in-95 duration-200";

				{visible.map(({ collaborator, editing }) => (
					<PresenceAvatar
						className={cn(
							AVATAR_SIZE,
							AVATAR_ENTER,
							editing ? EDITING_RING : undefined
						)}
						key={collaborator.clientId}
						name={collaborator.name}
					/>
				))}
```

`key` 已经是 `collaborator.clientId`——同一个人在同一次连接里始终是同一枚元素，
不会因为排序变化（编辑者排到查看者前面）而重新挂载、重播进场。**这一点是本计划
成立的前提，不要改动 `key`。**

「+N」那枚溢出指示器（第 150-161 行）也加同一段进场：它和头像逐像素对齐，
一个淡入一个硬切会看出错拍。

## Repo conventions to follow

- **类名常量提到模块作用域并配一段中文块注释解释「为什么」**。这个文件里
  `AVATAR_SIZE`（:48）、`EDITING_RING`（:61）、`TRIGGER_CLASS`（:73）、
  `MAX_VISIBLE_AVATARS`（:81）全是这个写法，注释密度以它们为准。
- **`cn()` 的参数次序按「基类 → 本地默认 → 条件覆盖」**，条件项排最后。
- **不引入动画库**，`tw-animate-css` 的具名类够用，且不含任意值。
- **不改 `packages/ui`**，也不改 `realtime/presence-avatar.tsx`：那是两处共用的
  唯一实现，改它等于同时改了顶栏。

## Steps

1. 在 `case-collaborators-cell.tsx` 里，紧挨着 `MAX_VISIBLE_AVATARS`（第 81 行）
   之后，加上 Target 段里那段带注释的 `AVATAR_ENTER` 常量。
2. 把第 145 行的 `className={cn(AVATAR_SIZE, editing ? EDITING_RING : undefined)}`
   改成 Target 段里的三参数形式。
3. 把第 152-158 行「+N」那枚 `<span>` 的 `cn(...)` 里，在 `AVATAR_SIZE` 之后
   加上 `AVATAR_ENTER`。
4. 不需要新增 import（`cn` 已在第 16 行导入）。

## Boundaries

- **不要动 `apps/web/src/realtime/presence-avatar.tsx`。** 一个字都不要改，
  包括它的注释。顶栏那组头像必须保持现在的行为。
- **不要动 `apps/web/src/realtime/presence-avatars.tsx`**（顶栏那组）。
- **不要给 blobatar 传 `animate` prop。** 那是已经论证过并否决的决定
  （见 `presence-avatar.tsx` 的注释），与本计划无关。
- **不要改 `key={collaborator.clientId}`。** 换成 index 或 name 会让排序变化
  触发重新挂载，进场就会在无人加入时莫名重播。
- **不要动 `AVATAR_SIZE`（`size-5`）。** 它是行高硬约束，
  `case-table-states.tsx` 的 263px 骨架高度按它折算（见 :34-47 的注释）。
- **不要给 tooltip、trigger、或 `EDITING_RING` 加任何过渡。** 描边换色是状态
  编码，加过渡会让「有人开始改了」这件事变得含糊。
- **不要新增依赖。**
- 若步骤里引用的行号或代码与你看到的对不上，**停下来报告**。

## Verification

- **Mechanical**：
  - `pnpm check-types` — 7/7 通过。
  - `pnpm exec vitest run` — 24 个文件 / 279 个测试全绿。
  - `pnpm dlx ultracite check apps packages` — 只应剩已知的 3 条 `noConsole` 警告。
  - `node scripts/check-tailwind.js apps/web/src/components/cases/case-collaborators-cell.tsx` — 退出码 0（成功时会打印一行 ✅，不是错误）。
  - `node scripts/check-file-rules.js apps/web/src/components/cases/case-collaborators-cell.tsx` — 退出码 0（成功时会打印一行 ✅，不是错误）。
- **Feel check**（需要两个浏览器窗口，其中一个用无痕窗口登另一个账号；
  只有一个账号时用两个不同浏览器 + 两次登录也可以）：
  1. 窗口 A 停在用例列表。窗口 B 打开列表里的某一条用例。
     窗口 A 对应那一行的协作列里，头像应当**淡着微微放大出现**，而不是瞬间贴上去。
     DevTools → Animations 面板调到 10% 速度看得最清楚。
  2. 窗口 B 里再开第二、第三条用例。每一枚新头像各自淡入，**已经在场的那些不动**
     ——若整堆一起重播，说明 `key` 被改坏了。
  3. 窗口 B 开到第 4 条用例，触发「+N」。那枚 `+N` 应当和头像一样淡入，
     不能一个淡一个硬切。
  4. 窗口 B 关掉一条。头像**直接消失**，没有退场动画——这是本计划明确的取舍，
     不是缺陷。
  5. 窗口 B 进入编辑态。琥珀色描边应当**立刻**换上，不带过渡。
  6. 行高检查：整个过程中表格行不应有任何上下跳动。若跳了，说明 `AVATAR_SIZE`
     被动过或进场类里混进了影响布局的属性。
  7. **减弱动效**：DevTools → Rendering → `prefers-reduced-motion: reduce`，
     重复第 1 步。头像应当直接出现。
- **Done when**：
  - `grep -c 'AVATAR_ENTER' apps/web/src/components/cases/case-collaborators-cell.tsx` 为 `3`。
  - 只碰了 `case-collaborators-cell.tsx` 一个文件（本仓大量文件尚未纳入 git，
    `git diff --stat` 看不到未跟踪文件的改动，不能用它当判据）。
  - Feel check 的第 1、2、6 条同时成立。

# 004 — 改筛选/翻页/开详情时不再整块换成骨架

- **Status**: TODO
- **Commit**: 0c78c13
- **Severity**: HIGH
- **Category**: 1 — 目的与频次
- **Estimated scope**: 4 个文件，约 +45 / -8 行
- **依赖 002**（要用它引入的 `transition-crossfade`）。
- 与 **005** 改同一个文件（`case-table.tsx`）但不改同一段：本计划在整块外面套一层
  容器，005 改的是空态分支内部。**先做本计划再做 005**，可避免手工合并。

## Problem

用例列表页有两层各自做对了一半、合起来互相抵消的实现。

**组件这一层已经做对了。** `apps/web/src/components/cases/case-list-view.tsx:227-232`：

```tsx
/* apps/web/src/components/cases/case-list-view.tsx:227-232 — current */
	const listQuery = useQuery(
		orpc.cases.list.queryOptions({
			input: caseListInput(projectId, search),
			placeholderData: keepPreviousData,
		})
	);
```

`keepPreviousData` 的全部意义就是：换查询参数时把上一份结果留在屏幕上，新数据到了
再原地换掉，中间不出现空窗。

**路由那一层把它整个架空了。** `apps/web/src/routes/projects/$projectId/index.tsx:21-36`：

```tsx
/* apps/web/src/routes/projects/$projectId/index.tsx:21-36 — current */
const caseListLoaderDeps = ({ search }: { search: WorkspaceSearch }) => ({
	search,
});

export const Route = createFileRoute("/projects/$projectId/")({
	component: CaseListPage,
	loader: ({ context, deps, params }) =>
		context.queryClient.ensureQueryData(
			context.orpc.cases.list.queryOptions({
				input: caseListInput(params.projectId, deps.search),
			})
		),
	loaderDeps: caseListLoaderDeps,
	pendingComponent: CaseListPending,
	validateSearch: workspaceSearchSchema,
});
```

`loaderDeps` 返回**整个 `search` 对象**，于是 URL 上任何一个 search 参数一变，
loader 就重跑；超过 `apps/web/src/router.tsx:28` 的 `PENDING_DELAY_MS = 200`，
路由就把 `CaseListPending` 换上来——**`CaseListView` 整个被卸载**，`keepPreviousData`
留下的那份数据连同承载它的组件一起消失，屏幕上换成 `CaseListSkeleton`。
而 `apps/web/src/router.tsx:34` 的 `PENDING_MIN_MS = 300` 还保证它至少停 300ms。

于是改一个筛选条件、翻一页、甚至**点开一条用例的详情抽屉**（`caseId` 也在 search 里），
都会走：真表格 → 灰条骨架（至少 300ms）→ 真表格。

这不是理论推演。`apps/web/src/components/layout/page-transition.tsx:80-83` 的注释
已经明确记下了这条路径：

> 为什么两端都登记、也都读，而不是只让骨架登记、只让就绪读：列表页的 loaderDeps 取自
> URL search，改筛选、切模块、翻页都会重跑 loader，超时同样会把 pendingComponent 换上
> 来。这类操作 pathname 压根没变，属于页内操作，一次进场都不该播。

也就是说仓库**已经发现了这个症状**，并且为它搭了一整套跨子树的模块级通道
（`onScreenPathname`）来压住重复的淡入。压住的是**淡入**，没有压住的是**整块内容
被换成骨架又换回来**这件事本身。修症状而没修病因。

频次上这是这一页最贵的一处：筛选与翻页是数十次/天的操作，点开详情抽屉更是上百次/天。

## Target

把 `loaderDeps` 从「整个 search」收窄到「只有 moduleId」。

```tsx
/* apps/web/src/routes/projects/$projectId/index.tsx — target */
/**
 * Declared outside the route options so TypeScript infers the loader deps
 * before it checks the (context-sensitive) `loader` in the same literal.
 *
 * 只取 moduleId，不取整个 search——这是本页手感的关键一条。loaderDeps 里的任何字段
 * 一变，路由就重跑 loader，超过 router.tsx 的 200ms 就把 pendingComponent 换上来，
 * 把整个 CaseListView 连同它 keepPreviousData 留住的那份数据一起卸载掉。取整个
 * search 的后果是：改筛选、翻页、甚至只是点开详情抽屉（caseId 也在 search 里），
 * 都会真表格 → 灰条骨架 → 真表格地闪一次，而 defaultPendingMinMs 还保证那一下
 * 至少停 300ms。
 *
 * 为什么这条线画在 moduleId 上：选模块是这一页的主导航，它换的是「在看哪一批用例」，
 * 让上一个模块的行留在新选中的模块标题下面是读错了；筛选、翻页、开抽屉都是对同一批
 * 用例的细化，上一份结果留着到新结果到达为止，读起来完全成立——那正是
 * case-list-view.tsx 里 keepPreviousData 一直想做、却被这里架空了的事。
 *
 * 代价（明确记下来）：URL 上直接带着筛选参数进来时（分享/收藏一个已筛选的视图），
 * loader 预取的是该模块未筛选的第一页，与组件真正要的那份 key 不同，会多一次请求，
 * 首屏由组件自己那份 CaseTableSkeleton（case-list-view.tsx 里 listQuery.data 为空
 * 的分支）兜住。这一档访问很少，换来的是每天几十上百次的页内操作不再闪。
 */
const caseListLoaderDeps = ({ search }: { search: WorkspaceSearch }) => ({
	moduleId: search.moduleId,
});

export const Route = createFileRoute("/projects/$projectId/")({
	component: CaseListPage,
	loader: ({ context, deps, params }) =>
		context.queryClient.ensureQueryData(
			context.orpc.cases.list.queryOptions({
				input: caseListInput(params.projectId, { moduleId: deps.moduleId }),
			})
		),
	loaderDeps: caseListLoaderDeps,
	pendingComponent: CaseListPending,
	validateSearch: workspaceSearchSchema,
});
```

（`caseListInput` 的第二个参数类型是 `WorkspaceSearch`，其字段全部 optional，
所以 `{ moduleId: deps.moduleId }` 直接合法，不需要改 `case-list-query.ts`。）

留在原地之后，需要给「正在取新数据」一个就地的信号——否则慢一点的请求期间屏幕
上什么都不动，用户不知道筛选生效了没有。用 002 引入的 `transition-crossfade`
把表格淡到 60% 不透明度：

```tsx
/* apps/web/src/components/cases/case-list-view.tsx — target */
	const listQuery = useQuery(
		orpc.cases.list.queryOptions({
			input: caseListInput(projectId, search),
			placeholderData: keepPreviousData,
		})
	);

	…

			{listQuery.data ? (
				<CaseListResult
					filtered={hasCaseFilters(search)}
					navigation={navigation}
					result={listQuery.data}
					selectedCaseId={search.caseId}
					stale={listQuery.isPlaceholderData}
				/>
			) : (
				<CaseTableSkeleton />
			)}
```

```tsx
/* apps/web/src/components/cases/case-table.tsx — target */

/**
 * 「这份是旧的，新的还在路上」的表达方式：淡到 60%。
 *
 * 为什么需要它：改筛选、翻页不再把整块内容换成骨架（见
 * routes/projects/$projectId/index.tsx 里 caseListLoaderDeps 的注释），
 * 上一份结果会留在屏幕上直到新结果到达。那段时间里若一点提示都没有，
 * 用户不知道筛选到底生效了没有。
 *
 * 为什么是 60% 而不是别的：这是最轻的一档「旧的」，既不遮挡阅读，也不像骨架
 * 那样把内容整个拿走。只淡不动——位移或缩放会让一张几十行的表整体晃一下，
 * 比原来的骨架还糟；transition-crossfade 只列 opacity 一个属性。
 *
 * 为什么不套一层容器统一挂：`<Empty>` 自带 flex-1，靠「直接作为 main 这个
 * flex 列的子元素」来吃满剩余高度，中间插一个普通 div 会让它塌成内容高度。
 * 两个分支各自挂在自己的根上，布局分毫不动。
 */
const STALE_CLASS = "transition-crossfade";

	if (cases.length === 0) {
		return (
			<CaseTableEmpty
				className={cn(STALE_CLASS, stale && "opacity-60")}
				filtered={filtered}
				onClearFilters={onClearFilters}
			/>
		);
	}

	return (
		<Table className={cn(STALE_CLASS, stale && "opacity-60")}>
			…表格内部原样不动…
		</Table>
	);
```

```tsx
/* apps/web/src/components/cases/case-table-states.tsx — target */
interface CaseEmptyProps {
	/** 由 CaseTable 传入的状态类（「这份是旧结果」的淡化）。 */
	className?: string;
	filtered: boolean;
	onClearFilters: () => void;
}

export function CaseTableEmpty({
	className,
	filtered,
	onClearFilters,
}: CaseEmptyProps) {
	return (
		<Empty className={className}>
			…内部原样不动…
		</Empty>
	);
}
```

分页条**不**跟着淡：它上面的总数与页码本来就会随新数据变，再淡一次是重复编码；
而且它是可点的控件，淡下去会读成「暂时不可用」。

## Repo conventions to follow

- **`loaderDeps` 单独声明在路由选项外面。** 已有先例就在同一个文件
  （`apps/web/src/routes/projects/$projectId/index.tsx:21-23`），且第 17-20 行的
  注释解释了为什么必须这样——保持那段注释，在它后面**追加**新的段落，不要覆盖。
- **每个判断都要一段中文块注释写清「为什么是这条线而不是别的」**，并把代价明确写出来。
  参照密度：`apps/web/src/routes/projects/$projectId/index.tsx:38-56` 那一整段。
- **类名合并一律用 `cn()`**，从 `@automationstack/ui/lib/utils` 导入。
  `case-table.tsx` 里若还没有这个 import，按 import 分组加进去（`@automationstack/*`
  在第一组）。
- **新增 prop 要按字母序排进 interface 与 JSX**（Biome 的 `useSortedKeys` /
  `useSortedJsxProps` 在本仓开着）：`stale` 排在 `selectedCaseId` 之后。
- **`transition-crossfade` 由 002 引入**，本计划直接用，不要重新定义。

## Steps

1. `apps/web/src/routes/projects/$projectId/index.tsx`：
   - 在第 17-20 行的现有 JSDoc 里，`before it checks the (context-sensitive)
     `loader` in the same literal.` 这一行之后，追加 Target 段里那几段中文注释
     （空一行分隔，保持 ` * ` 前缀）。
   - 把第 21-23 行的函数体从 `({ search }) => ({ search })` 改成
     `({ search }) => ({ moduleId: search.moduleId })`。
   - 把第 30 行的 `caseListInput(params.projectId, deps.search)` 改成
     `caseListInput(params.projectId, { moduleId: deps.moduleId })`。

2. `apps/web/src/components/cases/case-list-view.tsx`：
   - 在 `CaseListResultProps`（第 122-127 行）里加一个字段，按字母序排在
     `selectedCaseId` 之后：
     ```ts
     	/** 当前展示的是上一次查询留下的结果，新数据还在路上。 */
     	stale: boolean;
     ```
   - `CaseListResult`（第 130 行起）把 `stale` 透传给 `<CaseTable>`：在
     `selectedCaseId={props.selectedCaseId}` 之后加一行 `stale={props.stale}`。
   - 在第 246-251 行的 `<CaseListResult … />` 上，`selectedCaseId={search.caseId}`
     之后加一行 `stale={listQuery.isPlaceholderData}`。

3. `apps/web/src/components/cases/case-table-states.tsx`：
   - 给 `CaseEmptyProps`（第 44-47 行）加一个 optional 的 `className`，按字母序排在
     最前，带上 Target 段里那行注释。
   - `CaseTableEmpty` 的解构参数加上 `className`，并传给 `<Empty className={className}>`。
   - **不要动这个文件里的其他任何东西**——`CaseTableSkeleton`、`SWAP_ICON`、
     `CaseEmptyIcon` 一行都不改。

4. `apps/web/src/components/cases/case-table.tsx`：
   - 在 `CaseTableProps`（第 157-162 行）里加一个字段，按字母序排在
     `selectedCaseId` 之后：
     ```ts
     	/** 当前这份是上一次查询留下的旧结果；淡一档表示「还在取新的」。 */
     	stale: boolean;
     ```
   - 在 `CaseTable` 的解构参数里加上 `stale`（按字母序，在 `selectedCaseId` 之后）。
   - 在 `CaseTable` 函数**上方**、模块作用域里加上 Target 段那段带注释的
     `STALE_CLASS` 常量。
   - 按 Target 段给第 173-177 行的空态 return 补上 `className`，给第 179 行的
     `<Table>` 补上 `className`。**表格内部一行都不要改。**
   - 文件顶部已有 `import { cn } from "@automationstack/ui/lib/utils";`（第 11 行），
     不需要再加。

## Boundaries

- **不要删掉 `pendingComponent: CaseListPending`。** 切模块与冷启动仍然要用它。
- **不要动 `apps/web/src/components/layout/page-transition.tsx` 的任何一行。**
  `phase="pending"` / `phase="ready"` 那套机制在切模块与跨页导航时**仍然需要**。
  本计划只是让它少被触发，不是让它失效。
- **不要动 `apps/web/src/router.tsx` 的 `PENDING_DELAY_MS` / `PENDING_MIN_MS`。**
  两个数各自有论证（`router.tsx:23-34`），且它们服务的是全站所有路由。
- **不要动 `apps/web/src/components/cases/case-list-skeleton.tsx`**，也不要动
  `CaseTableSkeleton`。切模块与冷启动照旧用它们。
- **不要给 `CaseTable` 套任何新的包裹元素。**`<Empty>` 的 `flex-1` 依赖它是
  `main` 这个 flex 列的直接子元素，插一层普通 `div` 会让空态塌成内容高度。
- **不要动 `caseListInput` / `case-list-query.ts`。**
- **不要动 `CaseTable` 里 `<Table>` 内部的任何一行**（`COLUMNS`、`CaseRow`、
  表头、表体）。本计划只在它外面套一层。
- **不要动 `CaseTableEmpty`，也不要动 `case-table-states.tsx`。** 空态的进场是 005 的事。
- **不要新增依赖。**
- 若步骤里引用的行号或代码与你看到的对不上，**停下来报告**。

## Verification

- **Mechanical**：
  - `pnpm check-types` — 7/7 通过。若报 `Property 'stale' is missing`，说明三处
    prop 有漏传。
  - `pnpm exec vitest run` — 24 个文件 / 279 个测试全绿。
  - `pnpm dlx ultracite check apps packages` — 只应剩已知的 3 条 `noConsole` 警告。
  - `node scripts/check-tailwind.js apps/web/src/components/cases/case-table.tsx` — 退出码 0（成功时会打印一行 ✅，不是错误）。
  - `node scripts/check-file-rules.js apps/web/src/components/cases/case-table.tsx apps/web/src/components/cases/case-list-view.tsx apps/web/src/components/cases/case-table-states.tsx` — 退出码 0（成功时会打印一行 ✅，不是错误）（注意
    `case-list-view.tsx` 原本已在 263/300 行，本计划会让它更接近上限；若这条报出
    超限，**停下来报告**，不要自行拆分文件）。
- **Feel check**：进入一个**用例较多**（至少两页）的项目。为了看清楚，先在
  DevTools → Network 里把节流设成 `Slow 4G`。
  1. **改筛选**：在筛选栏改优先级或状态。表格**必须留在原地**，淡到 60%，新数据
     到达后淡回 100%。**不应出现任何灰色骨架条**。这是本计划的核心验收点。
  2. **翻页**：点分页条的下一页。同上，表格留在原地淡一档。
  3. **打开详情**：点任意一行打开详情抽屉。**整页不应有任何骨架**，表格连淡都
     不该淡（`caseId` 不影响 `cases.list` 的查询 key，`isPlaceholderData` 为 false）。
     改动前这一下会闪骨架。
  4. **切模块**（对照组，必须仍然是骨架）：在左侧模块树点另一个模块。这一次
     **应该**看到 `CaseListSkeleton`——工具栏一条 + 六条表格灰条。若切模块也变成
     了原地淡入，说明 `loaderDeps` 收得过头了（`moduleId` 没进去）。
  5. **快速连点**：在筛选栏里连续快速改三次条件。表格应始终留在原地，不透明度
     在 60% 与 100% 之间平滑过渡，**不应出现闪回全亮再变暗的跳变**（这是
     `transition-crossfade` 只列 opacity、可打断的效果）。
  6. **减弱动效**：DevTools → Rendering → `prefers-reduced-motion: reduce`，
     重复第 1 步。表格**仍应淡入淡出**，只是更快（120ms）——这依赖 002 已经落地。
     若变成硬切，说明 002 没做或做错了。
  7. 关掉网络节流再做一遍第 1 步：快请求下应该几乎看不到那一档淡，直接就换好了。
     若每次都明显闪一下暗，说明 `isPlaceholderData` 的判定挂在了错误的字段上。
- **Done when**：
  - `grep -n 'moduleId: search.moduleId' apps/web/src/routes/projects/\$projectId/index.tsx` 命中 1 处。
  - `grep -c 'deps.search' apps/web/src/routes/projects/\$projectId/index.tsx` 为 `0`。
  - `grep -rn 'stale' apps/web/src/components/cases/case-table.tsx apps/web/src/components/cases/case-list-view.tsx` 命中 7 处（含 `STALE_CLASS` 两处引用）。
  - 空态下（把筛选条件调到没有命中）分页条上方那块虚线空态框**仍然吃满剩余高度**，
    没有塌成一小块贴在表头下面——这是没有引入包裹元素的证据。
  - Feel check 的第 1、3、4 条同时成立（筛选不闪、开抽屉不闪、切模块仍然闪）。

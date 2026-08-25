/**
 * 执行台左栏：筛选 + 批量工具条 + 用例清单。
 *
 * 这个文件只负责把那三段拼起来、以及做「整栏才知道」的那几件事：协作者表、
 * 能不能勾选。每一段各自的细节在各自的文件里：
 * - 一行三个筛选控件 → `run-case-filters.tsx`
 * - 批量操作条 → `run-case-bulk-toolbar.tsx`
 * - 清单里的一行 → `run-case-row.tsx`
 *
 * 段与段之间的垂直节奏全部由容器的 gap-2 提供，各段只带水平 px-2
 * （plan 012 D3）；容器另加 pt-2，让首行不贴住 header 的 border-b。
 *
 * 拆分的直接原因是这份文件曾经 401 行、超过仓库 300 行的上限（scripts/
 * check-file-rules.js）。切法沿用这个目录里已有的做法——批量工具条早先就已经
 * 从本组件里抽成过一个函数，现在只是让文件边界跟那条已有的边界对齐。
 *
 * 清单那一段（`<ul>` 连同空态）本文件内再抽一层 `RunCaseRows`，为的是让
 * `RunCaseList` 回到 eslint 的 50 行函数上限之内。留在本文件而不是再开一个
 * 文件：它没有自己的对外契约，只是这一栏的下半截，跟着容器一起读最省事。
 */
import { memo } from "react";

import { BulkToolbar } from "@/components/test-runs/run-case-bulk-toolbar";
import { RunCaseFilters } from "@/components/test-runs/run-case-filters";
import { RunCaseRow } from "@/components/test-runs/run-case-row";
import type {
	ModuleOption,
	RunCaseDetail,
	RunCaseFilter,
} from "@/components/test-runs/run-execution-meta";
import {
	type CaseCollaborators,
	useCollaboratorsByCaseId,
} from "@/realtime/use-editing";

/**
 * 行组件包一层 memo：这一栏**不分页**，一个测试任务几百条用例就是几百个
 * `RunCaseRow` 同时挂着。没有 memo 时，只要 `RunCaseList` 因为任何理由重渲
 * （协作者进出、批量 mutation 的 pending 变化、附件配置查询回来、追加用例的
 * 抽屉开合），这几百行就全部重跑一遍函数体。
 *
 * memo 放在**调用侧**而不是 `run-case-row.tsx` 的定义侧，是因为 memo 生效的
 * 前提——「传下去的 props 引用稳定」——整个由本文件这一层保证。逐条对上
 * `RunCaseRowProps`：
 * - `checked` / `selectable` / `selected`：布尔，按值比。
 * - `item`：`cases` 的元素。它一路来自 `testRuns.get` 的查询结果，react-query
 *   的结构共享让没变过的那些条目在重取后保持同一个引用；中间只经过
 *   `useRunCaseSelection` 的 `useMemo` 筛选，不新建元素对象。
 * - `collaborators`：`collaboratorsByCaseId.get(...)`。绝大多数行取到
 *   `undefined`（同一个值，比得过），只有真的有人在看的那几行会拿到新对象、
 *   也确实该重渲。整张表本身在 `useCollaboratorsByCaseId` 里 useMemo 过，
 *   而它的输入 `usePresence()` 快照在内容不变时保持引用（见
 *   `realtime/presence-store.ts` 的 `commit`）——两件事缺一不可：快照稳定
 *   挡的是「心跳没带来任何变化」，memo 挡的是「别的地方触发了父组件重渲」。
 * - `onSelect` / `onToggleChecked`：分别是 `useRunVerdictHandlers` 的
 *   `handleSelect`（依赖链最终落到 `useNavigate`，本身是 useCallback）与
 *   `useCheckedIds` 的 `toggle`（空依赖 useCallback），都不随渲染换引用。
 *
 * 所以改本文件、或改上面那几个 hook 时，别顺手在 JSX 里写内联箭头函数或内联
 * 对象字面量往行里传：那会让每一行的 props 每次都不等，memo 从「省掉几百次
 * 渲染」变成「白做几百次浅比较」，纯负收益。
 */
const MemoRunCaseRow = memo(RunCaseRow);

/**
 * 清单本体：滚动容器、空态、逐行渲染。
 *
 * 定义在模块顶层而不是 `RunCaseList` 内部——写在组件内部的话，父组件每次
 * 重渲染都会造出一个新的组件类型，React 会把整份清单卸载重建，滚动位置归零。
 *
 * 本组件同样包了 memo（`MemoRunCaseRows`，见下方），理由与行级 memo 互补。
 */
function RunCaseRows({
	cases,
	checkedIds,
	collaboratorsByCaseId,
	onSelect,
	onToggleChecked,
	selectable,
	selectedRunCaseId,
}: {
	cases: readonly RunCaseDetail[];
	checkedIds: ReadonlySet<string>;
	collaboratorsByCaseId: ReadonlyMap<string, CaseCollaborators>;
	onSelect: (runCaseId: string) => void;
	onToggleChecked: (runCaseId: string) => void;
	selectable: boolean;
	selectedRunCaseId: string | null;
}) {
	return (
		<ul className="min-h-0 flex-1 overflow-y-auto pb-2">
			{cases.length === 0 ? (
				<li className="px-4 py-8 text-center text-muted-foreground text-sm">
					当前筛选下没有用例。
				</li>
			) : (
				cases.map((item) => (
					<MemoRunCaseRow
						checked={checkedIds.has(item.runCase.id)}
						collaborators={collaboratorsByCaseId.get(item.testCase.id)}
						item={item}
						key={item.runCase.id}
						onSelect={onSelect}
						onToggleChecked={onToggleChecked}
						selectable={selectable}
						selected={item.runCase.id === selectedRunCaseId}
					/>
				))
			)}
		</ul>
	);
}

/**
 * 整段清单也包一层 memo，与行级 memo 分工互补：
 * - 这一层挡的是「这一栏里什么都没变」——`RunCaseList` 被父组件带着重渲时，
 *   一次浅比较就整段跳过，连 `.map` 都不进，不必造几百个 element 再逐个比。
 * - 行级 memo 挡的是「真有一行变了」——那时整段必然重渲，但只有变了的那行
 *   会重跑函数体。
 *
 * props 的引用稳定性与 `MemoRunCaseRow` 那份清单是同一份（本组件的 props 就是
 * 行 props 的并集再加上 `cases` / `collaboratorsByCaseId` 两张表，两者都已在
 * 上游 useMemo 过）。
 */
const MemoRunCaseRows = memo(RunCaseRows);

export interface RunCaseListProps {
	canConclude: boolean;
	canEditCases: boolean;
	/** 当前筛选后的清单，右栏与快捷键跳转都以它为准。 */
	cases: readonly RunCaseDetail[];
	checkedIds: ReadonlySet<string>;
	filter: RunCaseFilter;
	moduleOptions: readonly ModuleOption[];
	onAddCases: () => void;
	onAssignToMe: () => void;
	onBulkPass: () => void;
	onFilterChange: (filter: RunCaseFilter) => void;
	onRemoveCases: () => void;
	onSelect: (runCaseId: string) => void;
	onToggleAll: () => void;
	onToggleChecked: (runCaseId: string) => void;
	selectedRunCaseId: string | null;
}

export function RunCaseList({
	canConclude,
	canEditCases,
	cases,
	checkedIds,
	filter,
	moduleOptions,
	onAddCases,
	onAssignToMe,
	onBulkPass,
	onFilterChange,
	onRemoveCases,
	onSelect,
	onToggleAll,
	onToggleChecked,
	selectedRunCaseId,
}: RunCaseListProps) {
	// 协作者表在列表这一层算一次就够：放进行组件里意味着每一行都重建一遍整张表。
	const collaboratorsByCaseId = useCollaboratorsByCaseId();

	// 一行能不能勾选，与工具条出不出现是同一个条件；工具条自己也会判一次
	// （它拿得到 canConclude / canEditCases），所以这里不再包一层三元。
	const selectable = canConclude || canEditCases;

	return (
		<div className="flex min-h-0 flex-col gap-2 border-r pt-2">
			<RunCaseFilters
				filter={filter}
				moduleOptions={moduleOptions}
				onFilterChange={onFilterChange}
			/>
			<BulkToolbar
				canConclude={canConclude}
				canEditCases={canEditCases}
				checkedCount={checkedIds.size}
				onAddCases={onAddCases}
				onAssignToMe={onAssignToMe}
				onBulkPass={onBulkPass}
				onRemoveCases={onRemoveCases}
				onToggleAll={onToggleAll}
				visibleCount={cases.length}
			/>
			<MemoRunCaseRows
				cases={cases}
				checkedIds={checkedIds}
				collaboratorsByCaseId={collaboratorsByCaseId}
				onSelect={onSelect}
				onToggleChecked={onToggleChecked}
				selectable={selectable}
				selectedRunCaseId={selectedRunCaseId}
			/>
		</div>
	);
}

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
 * 清单本体：滚动容器、空态、逐行渲染。
 *
 * 定义在模块顶层而不是 `RunCaseList` 内部——写在组件内部的话，父组件每次
 * 重渲染都会造出一个新的组件类型，React 会把整份清单卸载重建，滚动位置归零。
 *
 * 协作者表按 `collaboratorsByCaseId` 整张传进来，不在这里调
 * `useCollaboratorsByCaseId()`：那个 hook 留在 `RunCaseList` 的原位置，
 * 一栏只算一次（理由见调用处）。
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
					<RunCaseRow
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
			<RunCaseRows
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

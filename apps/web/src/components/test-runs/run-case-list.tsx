/**
 * 执行台左栏：结论统计 + 筛选 + 批量工具条 + 用例清单。
 *
 * 这个文件只负责把那四段拼起来、以及做「整栏才知道」的那几件事：全量结论计数、
 * 协作者表、能不能勾选。每一段各自的细节在各自的文件里：
 * - 三组筛选控件 → `run-case-filters.tsx`
 * - 批量操作条 → `run-case-bulk-toolbar.tsx`
 * - 清单里的一行 → `run-case-row.tsx`
 *
 * 拆分的直接原因是这份文件曾经 401 行、超过仓库 300 行的上限（scripts/
 * check-file-rules.js）。切法沿用这个目录里已有的做法——批量工具条早先就已经
 * 从本组件里抽成过一个函数，现在只是让文件边界跟那条已有的边界对齐。
 */
import { useMemo } from "react";
import { BulkToolbar } from "@/components/test-runs/run-case-bulk-toolbar";
import { RunCaseFilters } from "@/components/test-runs/run-case-filters";
import { RunCaseRow } from "@/components/test-runs/run-case-row";
import type {
	ModuleOption,
	RunCaseDetail,
	RunCaseFilter,
} from "@/components/test-runs/run-execution-meta";
import { countResults } from "@/components/test-runs/test-run-meta";
import { useCollaboratorsByCaseId } from "@/realtime/use-editing";

export interface RunCaseListProps {
	/** 统计恒定按**全量**算：筛选中还能看到全局还剩多少未测。 */
	allCases: readonly RunCaseDetail[];
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
	allCases,
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
	const counts = useMemo(
		() => countResults(allCases.map((item) => item.runCase.result)),
		[allCases]
	);

	const checkedCount = checkedIds.size;
	const selectable = canConclude || canEditCases;

	return (
		<div className="flex min-h-0 flex-col gap-2 border-r">
			<RunCaseFilters
				counts={counts}
				filter={filter}
				moduleOptions={moduleOptions}
				onFilterChange={onFilterChange}
			/>
			{selectable ? (
				<BulkToolbar
					canConclude={canConclude}
					canEditCases={canEditCases}
					checkedCount={checkedCount}
					onAddCases={onAddCases}
					onAssignToMe={onAssignToMe}
					onBulkPass={onBulkPass}
					onRemoveCases={onRemoveCases}
					onToggleAll={onToggleAll}
					visibleCount={cases.length}
				/>
			) : null}
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
		</div>
	);
}

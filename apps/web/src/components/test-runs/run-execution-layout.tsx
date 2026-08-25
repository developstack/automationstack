/**
 * 执行台的骨架与两栏布局：这个文件只做装配，不持有任何状态。
 *
 * 状态整份由 `useRunExecution` 备好后按分组传进来（`data` / `selection` /
 * `checked` / `verdict` / `bulk` / `storage`），所以这里出现的分支只关乎
 * 「画不画」，不关乎「能不能做」——后者已经在 `runPermissions()` 里定完了。
 *
 * 三个组件都定义在模块顶层，一个都不许挪进另一个的函数体里：那样每次父组件
 * 重渲染都会生成新的组件类型，React 认不出它是同一个组件，只能把整棵子树卸载
 * 重建——右栏里正在敲的说明、滚动位置、附件上传进度会当场全部丢掉。
 */
import type { TestRunCaseResult } from "@automationstack/db/schema/test-runs";

import { AddRunCasesSheet } from "@/components/test-runs/add-run-cases-sheet";
import { RunCaseList } from "@/components/test-runs/run-case-list";
import { RunCasePanel } from "@/components/test-runs/run-case-panel";
import { RunEvents } from "@/components/test-runs/run-events";
import { RunExecutionHeader } from "@/components/test-runs/run-execution-header";
import type { RunCaseDetail } from "@/components/test-runs/run-execution-meta";
import type { RunExecutionState } from "@/components/test-runs/run-execution-state";
import { RunLockedBanner } from "@/components/test-runs/run-locked-banner";

export interface RunExecutionLayoutProps extends RunExecutionState {
	projectId: string;
}

export function RunExecutionLayout(props: RunExecutionLayoutProps) {
	const { data } = props;
	return (
		<div className="flex min-h-0 flex-col">
			{data.permissions.locked && data.run.submittedAt !== null && (
				/*
				 * 三个值原样往下传：横幅要用 `submittedBy`（uuid）判「是不是系统
				 * 自动提交」，用 `submittedByName` 显示人名。两者不能互相替代，
				 * 理由见 RunLockedBannerProps 上的注释。
				 */
				<RunLockedBanner
					submittedAt={data.run.submittedAt}
					submittedBy={data.run.submittedBy}
					submittedByName={data.submittedByName}
				/>
			)}
			<RunExecutionHeader
				counts={{ ...props.selection.counts, total: data.cases.length }}
				projectId={props.projectId}
				run={data.run}
			/>
			<RunExecutionBody {...props} />
			<RunEvents runId={data.run.id} />
			<AddRunCasesSheet
				onClose={props.onCloseAdd}
				open={props.addOpen}
				projectId={props.projectId}
				runId={data.run.id}
			/>
		</div>
	);
}

/**
 * 两栏本体。整份 props 原样收下而不是再挑一遍，是为了让「加一个左栏字段」
 * 只改一处：`RunExecutionState` 里加、这里用，中间没有第三份要同步的清单。
 */
function RunExecutionBody(props: RunExecutionLayoutProps) {
	const { bulk, checked, data, selection, verdict } = props;
	return (
		<div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-run-execution">
			<RunCaseList
				canConclude={data.permissions.canConclude}
				canEditCases={data.permissions.canEditCases}
				cases={selection.visibleCases}
				checkedIds={checked.checkedIds}
				filter={data.filter}
				moduleOptions={selection.moduleOptions}
				onAddCases={props.onOpenAdd}
				onAssignToMe={bulk.handleAssignToMe}
				onBulkPass={bulk.handleBulkPass}
				onFilterChange={data.setFilter}
				onRemoveCases={bulk.handleRemoveCases}
				onSelect={verdict.handleSelect}
				onToggleAll={bulk.handleToggleAll}
				onToggleChecked={checked.toggle}
				selectedRunCaseId={selection.selected?.runCase.id ?? null}
			/>
			<RunExecutionCasePane
				canConclude={data.permissions.canConclude}
				locked={data.permissions.locked}
				onCommentSave={verdict.handleCommentSave}
				onPick={verdict.handleVerdict}
				onReset={verdict.handleReset}
				onStorageUnavailable={props.storage.markUnavailable}
				projectId={props.projectId}
				selected={selection.selected}
				storageUnavailable={props.storage.unavailable}
			/>
		</div>
	);
}

interface RunExecutionCasePaneProps {
	canConclude: boolean;
	locked: boolean;
	onCommentSave: (comment: string | null) => void;
	onPick: (result: TestRunCaseResult) => void;
	onReset: () => void;
	onStorageUnavailable: () => void;
	projectId: string;
	/** null = 当前筛选下一条都不剩，这时右栏出空态而不是留一片白。 */
	selected: RunCaseDetail | null;
	storageUnavailable: boolean;
}

/**
 * 右栏。`key={selected.runCase.id}` 是必需的：切用例时要把整块面板连同它内部
 * 的说明草稿、附件上传状态一起换掉，而不是让上一条的输入内容留在新一条上。
 */
function RunExecutionCasePane({
	canConclude,
	locked,
	onCommentSave,
	onPick,
	onReset,
	onStorageUnavailable,
	projectId,
	selected,
	storageUnavailable,
}: RunExecutionCasePaneProps) {
	return (
		<div className="min-h-0 overflow-y-auto">
			{selected === null ? (
				<p className="p-8 text-center text-muted-foreground text-sm">
					这个测试任务里还没有用例，先追加几条再开始测。
				</p>
			) : (
				<RunCasePanel
					canConclude={canConclude}
					item={selected}
					key={selected.runCase.id}
					locked={locked}
					onCommentSave={onCommentSave}
					onPick={onPick}
					onReset={onReset}
					onStorageUnavailable={onStorageUnavailable}
					projectId={projectId}
					storageUnavailable={storageUnavailable}
				/>
			)}
		</div>
	);
}

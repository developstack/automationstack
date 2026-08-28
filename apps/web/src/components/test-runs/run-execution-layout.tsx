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
		/*
		 * lg 起 flex-1：`main`（EXECUTION_MAIN）在 lg 下已经吃满了外层那个
		 * absolute inset-0 overflow-y-auto 的滚动容器，但这个根 div 是它唯一的
		 * 流内子元素，flex 子项默认 `flex: 0 1 auto`——不接住那段高度的话它只按
		 * 内容高度收住，下面那个 `flex-1` 的两栏区没有剩余空间可分，整摞按内容
		 * 高度停在半空，变更历史下面就露出一片空白（收起时最明显，那时内容最矮）。
		 * 断点与 EXECUTION_MAIN 严格一致：<lg 是堆叠布局，每行自适应内容、由外层
		 * 滚动容器整体滚，这时把高度钉死反而会把两行内容压得溢出被裁。
		 */
		<div className="flex min-h-0 flex-col lg:flex-1">
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
		/*
		 * lg:h-screen —— 用例区的高度定死为一屏（用户指示），不再依赖 flex-1 从上游
		 * 逐级分剩余空间：链上任何一环断掉，这一块也有一个确定的高度，左右两栏在
		 * 自己的 overflow-y-auto 里滚。min-h-0 保留：外层链完好时它允许本块收缩到
		 * 「视口减顶栏减变更历史」的实际可用高度，两种情况都不会把页面顶出滚动条。
		 */
		<div className="grid min-h-0 grid-cols-1 lg:h-screen lg:grid-cols-run-execution">
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
		/*
		 * 底面刻意压成灰：这一栏里的步骤是一张张 `bg-card` 卡片，卡片与底面同色时
		 * 「卡片」只剩一圈描边，十几张排下来是一片等距横线，数不清边界在哪
		 * （用户原话：「背景色为灰色，凸显卡片出来，不要都一个颜色」）。
		 * 用 /40 而不是实色：右栏还有说明、附件、缺陷这些**不在卡里**的段落，
		 * 底面太深会把它们压成「禁用」的观感。
		 */
		<div className="min-h-0 overflow-y-auto bg-muted/40">
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

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
import { cn } from "@automationstack/ui/lib/utils";

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
	// 先落成本地 const 再判空：TS 的别名收窄只认直接变量，穿不透属性链，
	// 不这样写的话下面横幅的 submittedAt 传参会推成 Date | null。
	const { submittedAt } = data.run;
	const showBanner = data.permissions.locked && submittedAt !== null;
	return (
		/*
		 * lg 起从 flex 换成 grid 定行：横幅（可选）/ header / 用例区 / 变更历史
		 * 各占一行，前后都是 auto、用例区独占 minmax(0,1fr)。之前用 flex-1 +
		 * 子项高度的写法，用例区的高度是「声明值再被 flex 收缩削一刀」得出的
		 * （h-screen 声明 100vh，实际渲染 ≈ 视口 − 138px），改声明值只会改收缩
		 * 权重，看起来像「改了不生效」。grid 行是算出来的：用例区 = 本容器高
		 * （lg:flex-1 = main = 视口 − 顶栏）− header − 变更历史，header 或
		 * 变更历史将来变高，1fr 行自动跟着缩，不再依赖 shrink 的巧合。
		 * 行模板跟着横幅有无切换：grid 行按位置对号入座，少了横幅那行不切模板
		 * 的话 header 会掉进 auto、用例区掉进另一个 auto，1fr 落到变更历史头上。
		 * 断点与 EXECUTION_MAIN 严格一致：<lg 是堆叠布局，每行自适应内容、由外层
		 * 滚动容器整体滚，这时把高度钉死反而会把两行内容压得溢出被裁。
		 */
		<div
			className={cn(
				"flex min-h-0 flex-col lg:grid lg:flex-1",
				showBanner
					? "lg:grid-rows-run-execution-banner"
					: "lg:grid-rows-run-execution"
			)}
		>
			{showBanner ? (
				/*
				 * 三个值原样往下传：横幅要用 `submittedBy`（uuid）判「是不是系统
				 * 自动提交」，用 `submittedByName` 显示人名。两者不能互相替代，
				 * 理由见 RunLockedBannerProps 上的注释。
				 */
				<RunLockedBanner
					submittedAt={submittedAt}
					submittedBy={data.run.submittedBy}
					submittedByName={data.submittedByName}
				/>
			) : null}
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
		 * 不写任何 h-*：这一块在根 grid 的 minmax(0,1fr) 行里，高度由那边算好
		 * （视口 − 顶栏 − header − 变更历史），grid item 默认 stretch 直接铺满。
		 * 曾经的 lg:h-screen 在这儿只是个会被 flex 收缩改写的 basis，声明 100vh
		 * 实际渲染不到，教训记在根 div 的注释里。min-h-0 必须留：没有它，行内
		 * 用例列表的 min-content 会把 1fr 行顶穿，左右两栏就滚不起来了。
		 */
		<div className="grid min-h-0 grid-cols-1 lg:grid-cols-run-execution">
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

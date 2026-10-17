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
import { RunVoidedBanner } from "@/components/test-runs/run-voided-banner";

export interface RunExecutionLayoutProps extends RunExecutionState {
	projectId: string;
}

function RunExecutionBanner({ data }: Pick<RunExecutionLayoutProps, "data">) {
	const { run } = data;
	if (run.voidedAt !== null) {
		return (
			<RunVoidedBanner
				voidedAt={run.voidedAt}
				voidedByName={data.voidedByName}
				voidReason={run.voidReason}
			/>
		);
	}
	if (run.submittedAt !== null) {
		return (
			<RunLockedBanner
				submittedAt={run.submittedAt}
				submittedBy={run.submittedBy}
				submittedByName={data.submittedByName}
			/>
		);
	}
	return null;
}

export function RunExecutionLayout(props: RunExecutionLayoutProps) {
	const { data } = props;
	// 已提交或已作废的测试任务在顶栏下显示只读说明。
	const showBanner = data.permissions.locked;
	return (
		<div
			className={cn(
				"flex min-h-0 flex-col lg:grid lg:flex-1",
				showBanner
					? "lg:grid-rows-run-execution-banner"
					: "lg:grid-rows-run-execution"
			)}
		>
			<RunExecutionHeader
				counts={{ ...props.selection.counts, total: data.cases.length }}
				projectId={props.projectId}
				run={data.run}
			/>
			{showBanner ? <RunExecutionBanner data={data} /> : null}
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

function RunExecutionBody(props: RunExecutionLayoutProps) {
	const { bulk, checked, data, selection, verdict } = props;
	return (
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
	selected: RunCaseDetail | null;
	storageUnavailable: boolean;
}

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
		<div className="relative min-h-0 overflow-y-auto bg-muted/40">
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

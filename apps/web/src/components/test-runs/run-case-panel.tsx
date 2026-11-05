import type { TestRunCaseResult } from "@automationstack/db/schema/test-runs";

import { useCaseAttachmentUrls } from "@/components/cases/case-attachment-context";
import type { MarkdownImageUrls } from "@/components/cases/markdown-inline-render";
import { RunCaseContent } from "@/components/test-runs/run-case-content";
import { RunCaseEvents } from "@/components/test-runs/run-case-events";
import { RunCaseHeading } from "@/components/test-runs/run-case-heading";
import { RunCaseStepsBlock } from "@/components/test-runs/run-case-steps-block";
import { RunCaseVerdictPanel } from "@/components/test-runs/run-case-verdict-panel";
import type { RunCaseDetail } from "@/components/test-runs/run-execution-meta";
import {
	RunStepAttachmentsProvider,
	useRunStepAttachmentsValue,
} from "@/components/test-runs/run-step-attachments-context";
import {
	useVerdictEditingMode,
	type VerdictEditingMode,
} from "@/components/test-runs/run-verdict-editing-mode";
import { canPickCaseVerdict } from "@/components/test-runs/run-verdict-entry";
import { useRunShortcuts } from "@/components/test-runs/use-run-shortcuts";

interface RunCaseBodyProps {
	editingMode: VerdictEditingMode;
	hasSteps: boolean;
	imageUrls: MarkdownImageUrls;
	item: RunCaseDetail;
	onStorageUnavailable: () => void;
	storageUnavailable: boolean;
}

/** 用例正文、步骤和事件。步骤的实际附件在编辑时可以上传和删除。 */
function RunCaseBody({
	editingMode,
	hasSteps,
	imageUrls,
	item,
	onStorageUnavailable,
	storageUnavailable,
}: RunCaseBodyProps) {
	const stepAttachments = useRunStepAttachmentsValue({
		editing: editingMode.editing,
		onStorageUnavailable,
		runCaseId: item.runCase.id,
		storageUnavailable,
	});
	return (
		<RunStepAttachmentsProvider value={stepAttachments}>
			<RunCaseContent imageUrls={imageUrls} testCase={item.testCase} />
			<RunCaseStepsBlock
				editingMode={editingMode}
				hasSteps={hasSteps}
				imageUrls={imageUrls}
				item={item}
			/>
			<RunCaseEvents runCaseId={item.runCase.id} />
		</RunStepAttachmentsProvider>
	);
}

export interface RunCasePanelProps {
	canConclude: boolean;
	item: RunCaseDetail;
	locked: boolean;
	onCommentSave: (comment: string | null) => void;
	onPick: (result: TestRunCaseResult) => void;
	onReset: () => void;
	onStorageUnavailable: () => void;
	projectId: string;
	storageUnavailable: boolean;
}

function hasVerdictOf(item: RunCaseDetail, hasSteps: boolean): boolean {
	const { runCase } = item;
	if (hasSteps) {
		return runCase.stepResults.length > 0;
	}
	return runCase.result !== "untested";
}

interface CaseVerdictEntryOptions {
	canConclude: boolean;
	item: RunCaseDetail;
	onPick: (result: TestRunCaseResult) => void;
}

function useCaseVerdictEntry({
	canConclude,
	item,
	onPick,
}: CaseVerdictEntryOptions) {
	const hasSteps = item.testCase.steps.length > 0;
	const editingMode = useVerdictEditingMode(
		hasVerdictOf(item, hasSteps),
		canConclude
	);
	useRunShortcuts({
		enabled: canPickCaseVerdict({ editing: editingMode.editing, hasSteps }),
		onVerdict: onPick,
	});
	return { editingMode, hasSteps };
}

export function RunCasePanel({
	canConclude,
	item,
	locked,
	onCommentSave,
	onPick,
	onReset,
	onStorageUnavailable,
	projectId,
	storageUnavailable,
}: RunCasePanelProps) {
	const { runCase, testCase } = item;
	const imageUrls = useCaseAttachmentUrls(testCase.id);
	const { editingMode, hasSteps } = useCaseVerdictEntry({
		canConclude,
		item,
		onPick,
	});
	return (
		<div className="flex flex-col gap-4 p-4">
			<RunCaseHeading
				canConclude={canConclude}
				editing={editingMode.editing}
				onEdit={editingMode.onEdit}
				onReset={onReset}
				projectId={projectId}
				runCase={runCase}
				testCase={testCase}
			/>
			<RunCaseVerdictPanel
				canConclude={canConclude}
				editing={editingMode.editing}
				hasSteps={hasSteps}
				item={item}
				locked={locked}
				onCommentSave={onCommentSave}
				onPick={onPick}
			/>
			<RunCaseBody
				editingMode={editingMode}
				hasSteps={hasSteps}
				imageUrls={imageUrls}
				item={item}
				onStorageUnavailable={onStorageUnavailable}
				storageUnavailable={storageUnavailable}
			/>
		</div>
	);
}

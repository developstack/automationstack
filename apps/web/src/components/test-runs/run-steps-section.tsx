import {
	deriveCaseResult,
	fillStepResults,
} from "@automationstack/db/repositories/test-run-step-results-core";
import type { CaseStep } from "@automationstack/db/schema/test-cases";
import type { TestRunStepResult } from "@automationstack/db/schema/test-runs";
import { useCallback, useEffect, useMemo } from "react";

import type { MarkdownImageUrls } from "@/components/cases/markdown-inline-render";
import type { RunCaseDetail } from "@/components/test-runs/run-execution-meta";
import {
	RUN_SECTION_TEXT,
	RUN_SECTION_TITLE,
} from "@/components/test-runs/run-panel-typography";
import { RunStepCard } from "@/components/test-runs/run-step-card";
import { RunStepsSummary } from "@/components/test-runs/run-steps-summary";
import type { VerdictEditingMode } from "@/components/test-runs/run-verdict-editing-mode";
import { useRunStepDraft } from "@/components/test-runs/use-run-step-draft";
import {
	useRunStepSave,
	useRunStepShortcuts,
} from "@/components/test-runs/use-run-step-save";

interface RunStepCardListProps {
	comments: Record<string, string>;
	editing: boolean;
	imageUrls: MarkdownImageUrls;
	judged: Record<string, TestRunStepResult>;
	onCommentChange: (stepId: string, text: string) => void;
	onPick: (stepId: string, result: TestRunStepResult) => void;
	steps: readonly CaseStep[];
}

function RunStepCardList({
	comments,
	editing,
	imageUrls,
	judged,
	onCommentChange,
	onPick,
	steps,
}: RunStepCardListProps) {
	return (
		<div className="flex flex-col gap-3">
			{steps.map((step, index) => (
				<RunStepCard
					comment={comments[step.id] ?? ""}
					editing={editing}
					imageUrls={imageUrls}
					index={index}
					key={step.id}
					onCommentChange={onCommentChange}
					onPick={onPick}
					result={judged[step.id]}
					step={step}
				/>
			))}
		</div>
	);
}

function useStepsPreview(
	steps: readonly CaseStep[],
	judged: Record<string, TestRunStepResult>,
	comments: Record<string, string>
) {
	const filled = useMemo(
		() => fillStepResults(steps, judged, comments),
		[comments, judged, steps]
	);
	return {
		derived: deriveCaseResult(filled),
		unjudged: steps.filter((step) => judged[step.id] === undefined).length,
	};
}

function RunStepsHeader({
	showShortcutHint,
	staleDiscarded,
}: {
	showShortcutHint: boolean;
	staleDiscarded: boolean;
}) {
	return (
		<>
			<div className="flex flex-wrap items-baseline justify-between gap-2">
				<h3 className={RUN_SECTION_TITLE}>步骤与判定</h3>
				{showShortcutHint ? (
					<p className={RUN_SECTION_TEXT}>
						快捷键 P / F / B / S 判给下一个还没判定的步骤
					</p>
				) : null}
			</div>
			{staleDiscarded ? (
				<p className="text-sm text-warning">
					用例已被改过，本机上一份没保存的分步判定已作废，请对着新步骤重新判定。
				</p>
			) : null}
		</>
	);
}

export interface RunStepsSectionProps {
	editingMode: VerdictEditingMode;
	imageUrls: MarkdownImageUrls;
	item: RunCaseDetail;
}

function useRunStepsSection(
	item: RunCaseDetail,
	editingMode: VerdictEditingMode
) {
	const { runCase, testCase } = item;
	const { steps } = testCase;
	const draft = useRunStepDraft({
		caseVersion: testCase.currentVersion,
		runCaseId: runCase.id,
		stepResults: runCase.stepResults,
		steps,
	});
	const { comments, judged } = draft;
	const { markSaved } = draft;
	const { editing, startEditing, stopEditing } = editingMode;

	const { dirty } = draft;
	useEffect(() => {
		if (dirty) {
			startEditing();
		}
	}, [dirty, startEditing]);

	const onSaved = useCallback(() => {
		markSaved();
		stopEditing();
	}, [markSaved, stopEditing]);

	const save = useRunStepSave({
		caseVersion: testCase.currentVersion,
		comments,
		judged,
		onSaved,
		runCaseId: runCase.id,
		steps,
	});
	useRunStepShortcuts({
		enabled: editing,
		judged,
		setResult: draft.setResult,
		steps,
	});

	return {
		draft,
		editing,
		preview: useStepsPreview(steps, judged, comments),
		save,
		steps,
	};
}

export function RunStepsSection({
	editingMode,
	imageUrls,
	item,
}: RunStepsSectionProps) {
	const { draft, editing, preview, save, steps } = useRunStepsSection(
		item,
		editingMode
	);
	const { comments, judged } = draft;

	return (
		<section className="flex flex-col gap-3">
			<RunStepsHeader
				showShortcutHint={editing}
				staleDiscarded={draft.staleDiscarded}
			/>
			<RunStepCardList
				comments={comments}
				editing={editing}
				imageUrls={imageUrls}
				judged={judged}
				onCommentChange={draft.setComment}
				onPick={draft.setResult}
				steps={steps}
			/>
			<RunStepsSummary
				derived={preview.derived}
				dirty={draft.dirty}
				editing={editing}
				onPassAll={draft.passAll}
				onReset={draft.reset}
				onSave={save.handleSave}
				saving={save.saving}
				unjudged={preview.unjudged}
			/>
		</section>
	);
}

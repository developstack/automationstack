/**
 * 执行台右栏的「步骤与判定」整段：每一步一张卡片 + 汇总条 + 保存。
 *
 * ## 它取代了原来的「用例级四颗按钮」
 *
 * 有步骤的用例，结论由分步结果推导（用户选的口径），所以这一段一出现，
 * 执行结论面板里那四颗用例级按钮就不再渲染（见 `run-case-verdict-body.tsx`）。
 * 两套入口并存的话，用户点一次用例级「通过」就会把逐步判出来的结果整片盖掉，
 * 而界面上没有任何东西提示他刚刚发生了什么。
 *
 * 没有步骤的用例仍然走原来那四颗按钮：那种用例没有分步可判，
 * 结论只能由人直接给（服务端的 `no-steps` 就是把走错门的调用挡回去的）。
 *
 * ## 编辑态住在父组件里
 *
 * 「现在能不能点」这份状态由 `useVerdictEditingMode` 持有（它现在管的是整个
 * 执行结论面板的读 / 改态，不止这一段，所以搬去了自己的文件），
 * 而那个 hook 是在 `RunCasePanel` 里调的、结果当 prop 传下来。原因是「修改」按钮
 * 在抬头上，抬头与这一段是**兄弟节点**，同一份状态只能由共同的父节点拿着。
 * 三条语义（没判过就直接进改态、草稿恢复强制进改态、`canConclude` 一票否决）
 * 一条不改，只是第二条留在了这里——只有这里看得见 `draft.dirty`。
 */
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
	/** false = 判定已保存，整列卡片只读。 */
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

/**
 * 汇总条要显示的两件事：保存后的用例结论、还有几步没判。
 *
 * 原先还有第三件「四态分布」，连同算它的 `countStepResults` 一起删了（用户原话
 * 「不要自己加戏」，来龙去脉在 `run-steps-summary.tsx` 的文件头）。
 *
 * 结论由 `fillStepResults` 的结果算出来，而那个函数与服务端写路径用的是**同一个**。
 * 预览与写路径各算各的，用户就会看到「预览说通过、保存完变成失败」，而且没有任何
 * 地方会报错——这正是那个模块被写成纯函数的原因。
 */
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

/** 小标题 + 快捷键提示 + 「上一份草稿作废了」那句话。 */
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
				<p className="text-amber-600 text-sm dark:text-amber-400">
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

/** 这一段用到的全部状态：工作副本 + 读改态 + 汇总预览 + 保存 + 快捷键。 */
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

	/*
	 * 本机草稿恢复出来就强制进改态（`useVerdictEditingMode` 的第二条语义）。
	 * 判断留在这一层是因为 `dirty` 是工作副本的状态，持有读 / 改态的父组件看不到它。
	 */
	const { dirty } = draft;
	useEffect(() => {
		if (dirty) {
			startEditing();
		}
	}, [dirty, startEditing]);

	// 保存成功才退出改态：失败时留在原地，用户那一屏判定还在草稿里。
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
	// 快捷键只在改态生效：结果页面按 P 应该什么都不发生，而不是悄悄改一步。
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

/**
 * 执行台右栏的「步骤与判定」整段：每一步一张卡片 + 汇总条 + 保存。
 *
 * ## 它取代了原来的「用例级四颗按钮」
 *
 * 有步骤的用例，结论由分步结果推导（用户选的口径），所以这一段一出现，
 * `RunCaseVerdictSection` 的四颗按钮就不再渲染（见 `run-case-panel.tsx`）。
 * 两套入口并存的话，用户点一次用例级「通过」就会把逐步判出来的结果整片盖掉，
 * 而界面上没有任何东西提示他刚刚发生了什么。
 *
 * 没有步骤的用例仍然走原来那四颗按钮：那种用例没有分步可判，
 * 结论只能由人直接给（服务端的 `no-steps` 就是把走错门的调用挡回去的）。
 *
 * ## 编辑态住在父组件里
 *
 * 「现在能不能点」这份状态由 `useSteppedEditingMode` 持有，而这个 hook 是在
 * `RunCasePanel` 里调的、结果当 prop 传下来。原因是「修改」按钮已经搬到了抬头，
 * 抬头与这一段是**兄弟节点**，同一份状态只能由共同的父节点拿着。
 * 三条语义（默认进编辑态、草稿恢复强制进编辑态、`canConclude` 一票否决）
 * 一条不改，只是第二条留在了这里——只有这里看得见 `draft.dirty`。
 */
import {
	deriveCaseResult,
	fillStepResults,
} from "@automationstack/db/repositories/test-run-step-results-core";
import type { CaseStep } from "@automationstack/db/schema/test-cases";
import type { TestRunStepResult } from "@automationstack/db/schema/test-runs";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { MarkdownImageUrls } from "@/components/cases/markdown-inline-render";
import type { RunCaseDetail } from "@/components/test-runs/run-execution-meta";
import { RunStepCard } from "@/components/test-runs/run-step-card";
import {
	RunStepsSummary,
	type StepResultCounts,
} from "@/components/test-runs/run-steps-summary";
import { useRunStepDraft } from "@/components/test-runs/use-run-step-draft";
import {
	useRunStepSave,
	useRunStepShortcuts,
} from "@/components/test-runs/use-run-step-save";

function emptyStepCounts(): StepResultCounts {
	return { blocked: 0, failed: 0, passed: 0, skipped: 0 };
}

function countStepResults(
	results: readonly { result: TestRunStepResult }[]
): StepResultCounts {
	const counts = emptyStepCounts();
	for (const item of results) {
		counts[item.result] += 1;
	}
	return counts;
}

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
 * 汇总条要显示的三件事：保存后的用例结论、四态分布、还有几步没判。
 *
 * 结论与分布都由 `fillStepResults` 的结果算出来，而那个函数与服务端写路径用的是
 * **同一个**。预览与写路径各算各的，用户就会看到「预览说通过、保存完变成失败」，
 * 而且没有任何地方会报错——这正是那个模块被写成纯函数的原因。
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
		counts: countStepResults(filled),
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
				<h3 className="font-medium text-sm">步骤与判定</h3>
				{showShortcutHint ? (
					<p className="text-muted-foreground text-xs">
						快捷键 P / F / B / S 判给下一个还没判定的步骤
					</p>
				) : null}
			</div>
			{staleDiscarded ? (
				<p className="text-amber-600 text-xs dark:text-amber-400">
					用例已被改过，本机上一份没保存的分步判定已作废，请对着新步骤重新判定。
				</p>
			) : null}
		</>
	);
}

export interface SteppedEditingMode {
	/** 已经被 `canConclude` 否决过的最终编辑态，直接拿去用。 */
	editing: boolean;
	/** `null` = 这个任务谁都不能改（待评审 / 已提交），连「修改」都不给。 */
	onEdit: (() => void) | null;
	/** 草稿恢复出来时强制进编辑态用；只有 `RunStepsSection` 会调。 */
	startEditing: () => void;
	/** 保存成功后退出编辑态。 */
	stopEditing: () => void;
}

/**
 * 「现在能不能点」这一件事。
 *
 * 初值：没保存过分步结果就直接进编辑态（用户打开一条没测过的用例，本来就是来判的，
 * 还要先点一下「修改」纯属多一步）；已经保存过就是只读，改要显式点「修改」。
 *
 * 本机草稿一旦恢复出来（`dirty` 变真）也要进编辑态：那份草稿正是上次没写完的判定，
 * 摆在只读界面里等于用户看得见自己写的字却动不了。这一条落在 `useRunStepsSection`
 * 里——`dirty` 是工作副本的状态，只有那边看得见，它调这里的 `startEditing`。
 *
 * `canConclude` 是一票否决：待评审 / 已提交的任务谁都不能改，这时连「修改」都不给。
 * 否决只在读出去的两个字段上生效，`editing` 这个 state 本身不动：任务从待评审
 * 评审完变成可测时，用户不该被要求先点一下「修改」才能接着判。
 *
 * 由 `RunCasePanel` 调用，结果同时喂给抬头的「修改」按钮和这一段——
 * 两者是兄弟节点，状态只能放在它们的父节点上。
 */
export function useSteppedEditingMode(
	hasSavedResults: boolean,
	canConclude: boolean
): SteppedEditingMode {
	const [editing, setEditing] = useState(!hasSavedResults);
	const startEditing = useCallback(() => setEditing(true), []);
	const stopEditing = useCallback(() => setEditing(false), []);
	return {
		editing: canConclude && editing,
		onEdit: canConclude ? startEditing : null,
		startEditing,
		stopEditing,
	};
}

export interface RunStepsSectionProps {
	editingMode: SteppedEditingMode;
	imageUrls: MarkdownImageUrls;
	item: RunCaseDetail;
}

/** 这一段用到的全部状态：工作副本 + 编辑态 + 汇总预览 + 保存 + 快捷键。 */
function useRunStepsSection(
	item: RunCaseDetail,
	editingMode: SteppedEditingMode
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
	 * 本机草稿恢复出来就强制进编辑态（`useSteppedEditingMode` 的第二条语义）。
	 * 判断留在这一层是因为 `dirty` 是工作副本的状态，持有编辑态的父组件看不到它。
	 */
	const { dirty } = draft;
	useEffect(() => {
		if (dirty) {
			startEditing();
		}
	}, [dirty, startEditing]);

	// 保存成功才退出编辑态：失败时留在原地，用户那一屏判定还在草稿里。
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
	// 快捷键只在编辑态生效：只读时按 P 应该什么都不发生，而不是悄悄改一步。
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
				counts={preview.counts}
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

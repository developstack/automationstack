/**
 * 执行结论面板里的结论本体：判定入口 + 说明。从 `run-case-verdict-panel.tsx`
 * 拆出来（那个文件的私有辅助组件超过了一个文件 2 个的上限）。
 */

import type { TestRunCaseResult } from "@automationstack/db/schema/test-runs";

import { VerdictBody } from "@/components/test-runs/run-case-verdict-body";
import type { RunCaseDetail } from "@/components/test-runs/run-execution-meta";
import { VerdictComment } from "@/components/test-runs/run-verdict-comment";

interface VerdictPanelDecisionProps {
	canConclude: boolean;
	editing: boolean;
	hasSteps: boolean;
	onCommentSave: (comment: string | null) => void;
	onPick: (result: TestRunCaseResult) => void;
	runCase: RunCaseDetail["runCase"];
}

/**
 * 结论本身：判定入口 + 说明。
 *
 * 判定入口只在修改页面出现——结果页面上「判成了什么」已经写在用例名旁边的
 * 徽章上，再摆一排按钮既多余又容易误触（尤其是分步形态下，用例级按钮会把
 * 逐步判定盖掉，那条不变量见 `run-case-verdict-body.tsx`）。
 *
 * 说明两态都渲染，因为它两态**长得不一样**：结果页面是一段可选可复制的文字、
 * 空就不画，修改页面才是 textarea。这个二选一由 `VerdictComment` 自己完成，
 * 它同时看得见本地草稿，是唯一能判断「有没有还没保存的字」的地方。
 */
export function VerdictPanelDecision({
	canConclude,
	editing,
	hasSteps,
	onCommentSave,
	onPick,
	runCase,
}: VerdictPanelDecisionProps) {
	return (
		<>
			{editing ? (
				<VerdictBody
					canConclude={canConclude}
					editing={editing}
					hasSteps={hasSteps}
					onPick={onPick}
					runCase={runCase}
				/>
			) : null}
			<VerdictComment
				comment={runCase.comment}
				editable={editing && !hasSteps}
				onCommentSave={onCommentSave}
				result={runCase.result}
				runCaseId={runCase.id}
			/>
		</>
	);
}

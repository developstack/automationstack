/**
 * 执行台右栏抬头右侧那一对常用操作：「修改」与「打回未测」。
 *
 * 从 `run-case-heading.tsx` 拆出来（那个文件的私有辅助组件超过了一个文件 2 个的
 * 上限）。为什么两颗按钮就贴在用例名旁边、为什么它俩必须同尺寸同变体，记在
 * `run-case-heading.tsx` 的文件头。
 */
import { Button } from "@automationstack/ui/components/button";
import { PencilIcon } from "lucide-react";

import type { RunCaseDetail } from "@/components/test-runs/run-execution-meta";
import { ResetVerdictButton } from "@/components/test-runs/run-reset-verdict-button";

export interface RunCaseHeaderActionsProps {
	/** 能否打结论：`pending_review` 与 `submitted` 都不能。 */
	canConclude: boolean;
	/** 执行结论面板此刻是不是改态——正在改就不再给「修改」。 */
	editing: boolean;
	/** `null` = 这个任务谁都不能改（待评审 / 已提交），连「修改」都不给。 */
	onEdit: (() => void) | null;
	onReset: () => void;
	/**
	 * 整行原样收下，不再只挑 `result`：「打回未测」要按这次回退会不会丢东西
	 * 决定弹不弹确认框，判据要读 `comment` 与 `stepResults`（见
	 * `run-reset-impact.ts`）。挑字段传的话，这里每加一档判据都要多穿一个 prop。
	 */
	runCase: RunCaseDetail["runCase"];
}

/**
 * 标题行右侧那一对按钮。显隐门禁与它们原来待的地方逐条一致，没有放宽：
 *
 * - 「修改」：要 `editing === false` 与 `onEdit !== null`。不再要求有步骤——
 *   读 / 改态现在管的是整个执行结论面板，没步骤的用例判过之后同样停在结果页面；
 * - 「打回未测」：`result !== "untested"` 才画，不能打结论时按 `aria-disabled`
 *   留在原位而不是隐掉（那颗按钮连同它的二次确认在 `run-reset-verdict-button.tsx`）。
 *
 * 两颗都没得画时整条不渲染，不留一条空的按钮行占着 gap。
 */
export function RunCaseHeaderActions({
	canConclude,
	editing,
	onEdit,
	onReset,
	runCase,
}: RunCaseHeaderActionsProps) {
	const editAction = editing ? null : onEdit;
	const showReset = runCase.result !== "untested";
	if (editAction === null && !showReset) {
		return null;
	}
	return (
		// shrink-0：用例名再长也不许把这两颗按钮压扁，名字那半自己换行让位。
		<div className="flex shrink-0 items-center gap-2">
			{editAction === null ? null : (
				<Button onClick={editAction} size="sm" type="button" variant="outline">
					<PencilIcon aria-hidden="true" data-icon="inline-start" />
					修改
				</Button>
			)}
			{showReset ? (
				<ResetVerdictButton
					canConclude={canConclude}
					comment={runCase.comment}
					onReset={onReset}
					stepResultCount={runCase.stepResults.length}
				/>
			) : null}
		</div>
	);
}

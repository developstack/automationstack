/**
 * 步骤卡片的下半截。从 `run-step-card.tsx` 拆出来（那个文件的私有辅助组件超过了
 * 一个文件 2 个的上限），显隐规则与两种形态原样搬过来。
 */

import type { TestRunStepResult } from "@automationstack/db/schema/test-runs";
import type { ChangeEvent } from "react";

import { reasonKindOf } from "@/components/test-runs/run-step-reason";
import { StepReasonField } from "@/components/test-runs/step-reason-field";
import { StepReasonNote } from "@/components/test-runs/step-reason-note";
import { StepVerdictRow } from "@/components/test-runs/step-verdict-row";

/**
 * 卡片下半截：编辑态是「四颗判定 + 原因输入框」，只读态是「一块原因文本」。
 *
 * 两种形态写在一处而不是散在 `RunStepCard` 的 JSX 里，是因为它们互斥且共用
 * 同一个 `reasonKind`——分开写的话，将来给失败/阻塞加一种新形态，很容易
 * 只改到其中一支，另一支静默地还按旧规则渲染。
 */
export function StepCardFooter({
	comment,
	editing,
	index,
	onCommentChange,
	onPick,
	result,
	stepId,
}: {
	comment: string;
	editing: boolean;
	index: number;
	onCommentChange: (event: ChangeEvent<HTMLTextAreaElement>) => void;
	onPick: (stepId: string, result: TestRunStepResult) => void;
	result: TestRunStepResult | undefined;
	stepId: string;
}) {
	const kind = reasonKindOf(result);
	if (!editing) {
		// 只读态：没写过原因就什么都不留，别在卡底吊一块空色块。
		return kind !== null && comment !== "" ? (
			<StepReasonNote kind={kind} value={comment} />
		) : null;
	}
	return (
		<>
			<StepVerdictRow
				current={result}
				index={index}
				onPick={onPick}
				stepId={stepId}
			/>
			{kind === null ? null : (
				<StepReasonField
					kind={kind}
					onChange={onCommentChange}
					stepId={stepId}
					value={comment}
				/>
			)}
		</>
	);
}

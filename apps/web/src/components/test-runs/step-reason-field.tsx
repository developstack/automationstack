/**
 * 失败 / 阻塞原因的可编辑形态。从 `run-step-reason.tsx` 拆出来（那个文件同时
 * 导出两个组件），配色表留在原地的 `run-step-reason.ts` 里，两种形态共用。
 */

import { Textarea } from "@automationstack/ui/components/textarea";
import type { ChangeEvent } from "react";

import {
	REASON_FIELD_CLASSES,
	REASON_FIELD_TEXT,
	type ReasonKind,
} from "@/components/test-runs/run-step-reason";
import { RESULT_TEXT_CLASSES } from "@/components/test-runs/test-run-meta";

interface StepReasonFieldProps {
	kind: ReasonKind;
	onChange: (event: ChangeEvent<HTMLTextAreaElement>) => void;
	stepId: string;
	value: string;
}

/**
 * 原因输入框。**只在判成失败 / 阻塞时渲染**，但框里的字并不随判定被清空——
 * 那份文本存在草稿里（见 `use-run-step-draft.ts`），用户误点通过再点回失败，
 * 写过的原因原样还在。真正的清理在保存那一刻由服务端做。
 */
export function StepReasonField({
	kind,
	onChange,
	stepId,
	value,
}: StepReasonFieldProps) {
	const text = REASON_FIELD_TEXT[kind];
	const fieldId = `run-step-reason-${stepId}`;
	return (
		<div className="mt-3 flex flex-col gap-1.5">
			<label className="font-medium text-xs" htmlFor={fieldId}>
				<span className={RESULT_TEXT_CLASSES[kind]}>{text.label}</span>
			</label>
			<Textarea
				className={REASON_FIELD_CLASSES[kind]}
				id={fieldId}
				onChange={onChange}
				placeholder={text.placeholder}
				rows={2}
				value={value}
			/>
		</div>
	);
}

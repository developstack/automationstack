/**
 * 失败 / 阻塞原因的两种形态：可编辑的输入框，与保存后带底色的只读文本。
 *
 * 从 `run-step-card.tsx` 拆出来，那个文件已经压着 300 行上限。这三块（配色表、
 * 输入框、只读块）是同一件事的一体两面，改配色时必须一起改，放同一个文件才不会
 * 出现「编辑时是红的、保存后变成灰的」这种只有截图才看得出来的漂移。
 */

import { stepNeedsComment } from "@automationstack/db/repositories/test-run-step-results-core";
import type { TestRunStepResult } from "@automationstack/db/schema/test-runs";
import { Textarea } from "@automationstack/ui/components/textarea";
import type { ChangeEvent } from "react";
import { RESULT_TEXT_CLASSES } from "@/components/test-runs/test-run-meta";

export type ReasonKind = "blocked" | "failed";

/**
 * 失败原因用红、阻塞原因用琥珀，与 `RESULT_TEXT_CLASSES` 里那两态同色。
 * 用户要的是「失败原因以红色显示」，阻塞跟着一起走结论色而不是也涂红——
 * 两态在这一页处处是分开的（图标、徽章、统计），唯独这里合并会让人以为判错了。
 */
const REASON_FIELD_CLASSES: Record<ReasonKind, string> = {
	blocked:
		"border-amber-600/40 text-amber-700 placeholder:text-amber-700/50 dark:border-amber-400/40 dark:text-amber-300 dark:placeholder:text-amber-300/50",
	failed:
		"border-destructive/40 text-destructive placeholder:text-destructive/50",
};

const REASON_FIELD_TEXT: Record<
	ReasonKind,
	{ label: string; placeholder: string }
> = {
	blocked: {
		label: "阻塞原因",
		placeholder: "卡在哪、缺什么环境或数据，解开后才知道从哪接着测",
	},
	failed: {
		label: "失败原因",
		placeholder: "实际现象与复现路径，这段会汇总进用例说明并带进 Jira",
	},
};

/** 只读态的原因块：带底色，与徽章同色系。 */
const REASON_NOTE_CLASSES: Record<ReasonKind, string> = {
	blocked: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
	failed: "bg-destructive/10 text-destructive",
};

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

/** 只读态的原因：一块带底色的文本，不是输入框。仍可选中复制。 */
export function StepReasonNote({
	kind,
	value,
}: {
	kind: ReasonKind;
	value: string;
}) {
	return (
		<p
			className={`mt-3 whitespace-pre-wrap break-words rounded-md px-2 py-1.5 text-sm ${REASON_NOTE_CLASSES[kind]}`}
		>
			{value}
		</p>
	);
}

/** 判成失败 / 阻塞时才有原因可显示；其余两态即使草稿里留着字也不露出来。 */
export function reasonKindOf(
	result: TestRunStepResult | undefined
): ReasonKind | null {
	if (result === undefined || !stepNeedsComment(result)) {
		return null;
	}
	return result === "failed" ? "failed" : "blocked";
}

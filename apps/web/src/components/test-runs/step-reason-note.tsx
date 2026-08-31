/**
 * 失败 / 阻塞原因保存之后的只读形态。从 `run-step-reason.tsx` 拆出来（那个文件
 * 同时导出两个组件），配色表留在原地的 `run-step-reason.ts` 里，两种形态共用。
 */

import {
	REASON_NOTE_CLASSES,
	type ReasonKind,
} from "@/components/test-runs/run-step-reason";

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

/**
 * 失败 / 阻塞原因保存之后的只读形态。从 `run-step-reason.tsx` 拆出来（那个文件
 * 同时导出两个组件），配色表留在原地的 `run-step-reason.ts` 里，两种形态共用。
 *
 * ## 为什么要显式打出「失败原因：」
 *
 * 保存之后这块文本就只剩一段带底色的字，前面没有任何说明。用户看到的是一句
 * 孤零零的现象描述，得先自己回想「这段红字是什么」——与元信息行那个裸「生效」
 * 是同一类毛病：**一个值离开它的字段名就不再是信息**。所以前缀写死在这里，
 * 而且取的是 `REASON_FIELD_TEXT` 里编辑态输入框用的同一个标签，失败是「失败原因」、
 * 阻塞是「阻塞原因」，两态不会共用一个词，也不会与输入框那边漂移。
 *
 * ## 字号与颜色
 *
 * `text-xs` 与同一张卡片里的「预期」对齐（用户要求两者一致），比步骤正文小一号。
 * 红色不写死：`REASON_NOTE_CLASSES.failed` 用的是仓库的 `destructive` token
 * （`bg-destructive/10 text-destructive`），阻塞那一档走琥珀，理由见
 * `run-step-reason.ts`。
 */

import {
	REASON_FIELD_TEXT,
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
			className={`mt-3 whitespace-pre-wrap break-words rounded-md px-2 py-1.5 text-xs ${REASON_NOTE_CLASSES[kind]}`}
		>
			{/* 前缀加粗而不是换色：整块已经是红（或琥珀）的，再分两种红只会更花 */}
			<span className="font-medium">{`${REASON_FIELD_TEXT[kind].label}：`}</span>
			{value}
		</p>
	);
}

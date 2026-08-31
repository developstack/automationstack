/**
 * 失败 / 阻塞原因的配色表与判据：两种形态（可编辑输入框 / 保存后的只读文本）
 * 共用的那一份。
 *
 * 从 `run-step-card.tsx` 拆出来，那个文件已经压着 300 行上限。三张表仍然留在
 * 同一个文件里，改配色时必须一起改——分散开就会出现「编辑时是红的、保存后
 * 变成灰的」这种只有截图才看得出来的漂移。两种形态本身按「一个文件一个组件」
 * 各自住在 `step-reason-field.tsx` 与 `step-reason-note.tsx`，配色都从这里取。
 */

import { stepNeedsComment } from "@automationstack/db/repositories/test-run-step-results-core";
import type { TestRunStepResult } from "@automationstack/db/schema/test-runs";

export type ReasonKind = "blocked" | "failed";

/**
 * 失败原因用红、阻塞原因用琥珀，与 `RESULT_TEXT_CLASSES` 里那两态同色。
 * 用户要的是「失败原因以红色显示」，阻塞跟着一起走结论色而不是也涂红——
 * 两态在这一页处处是分开的（图标、徽章、统计），唯独这里合并会让人以为判错了。
 */
export const REASON_FIELD_CLASSES: Record<ReasonKind, string> = {
	blocked:
		"border-amber-600/40 text-amber-700 placeholder:text-amber-700/50 dark:border-amber-400/40 dark:text-amber-300 dark:placeholder:text-amber-300/50",
	failed:
		"border-destructive/40 text-destructive placeholder:text-destructive/50",
};

export const REASON_FIELD_TEXT: Record<
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
export const REASON_NOTE_CLASSES: Record<ReasonKind, string> = {
	blocked: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
	failed: "bg-destructive/10 text-destructive",
};

/** 判成失败 / 阻塞时才有原因可显示；其余两态即使草稿里留着字也不露出来。 */
export function reasonKindOf(
	result: TestRunStepResult | undefined
): ReasonKind | null {
	if (result === undefined || !stepNeedsComment(result)) {
		return null;
	}
	return result === "failed" ? "failed" : "blocked";
}
